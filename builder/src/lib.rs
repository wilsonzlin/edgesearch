use std::cmp::{max, min};
use std::collections::{HashMap, HashSet};
use std::convert::TryInto;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::str::FromStr;

use byteorder::{LittleEndian, WriteBytesExt};
use croaring::Bitmap;

use crate::format::{average_int, bytes, frac_perc, number, percent, round2};
use crate::murmur3::mmh3_x64_128;

mod format;
mod murmur3;

type Term = Vec<u8>;
type TermId = usize;

const DOCUMENT_ID_BYTES: usize = 4;

pub enum DocumentEncoding {
    Json,
    Text,
}

impl FromStr for DocumentEncoding {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "json" => Ok(DocumentEncoding::Json),
            "text" => Ok(DocumentEncoding::Text),
            _ => Err("Invalid document encoding".to_string()),
        }
    }
}

macro_rules! interval_log {
    ($interval:expr, $no:expr, $len:expr, $fmt:literal) => {
        if $no % $interval == 0 {
            println!($fmt, percent($no as f64 / $len as f64));
        };
    };
}

fn status_log_interval(len: usize, times: usize) -> usize {
    1 << (((len as f64) / (times as f64)).log2().ceil() as usize)
}

struct TermsReader {
    reader: BufReader<File>,
    current_document_id: usize,
    bytes_read: usize,
    eof: bool,
    log_interval: usize,
    total_bytes: usize,
}

impl TermsReader {
    fn new(input: File) -> TermsReader {
        let file_bytes: usize = input.metadata().unwrap().len().try_into().expect("file is too large");
        TermsReader {
            reader: BufReader::new(input),
            current_document_id: 0,
            bytes_read: 0,
            eof: false,
            log_interval: status_log_interval(file_bytes, 20),
            total_bytes: file_bytes,
        }
    }
}

impl Iterator for TermsReader {
    type Item = (usize, Vec<u8>);

    fn next(&mut self) -> Option<Self::Item> {
        if self.eof { return None; };

        loop {
            let mut term = Term::new();

            let term_bytes = self.reader.read_until(b'\0', &mut term).expect("reading term");
            self.bytes_read += term_bytes;
            interval_log!(self.log_interval, self.bytes_read, self.total_bytes, "Reading document terms ({})...");
            match term_bytes {
                // End of file.
                0 => {
                    self.eof = true;
                    return None;
                }
                // End of document.
                1 => {
                    self.current_document_id += 1;
                }
                _ => {
                    // Remove null terminator.
                    term.pop().filter(|c| *c == b'\0').expect("removal of null terminator");
                    return Some((self.current_document_id, term));
                }
            };
        }
    }
}

struct WrittenBitmapsStats {
    set_bit_count: usize,
    total_bitmap_bytes: usize,
}

fn write_bitmaps<'b, T: Iterator<Item=(Vec<u8>, &'b Bitmap)>>(mut output: File, bitmaps: T, bitmap_count: usize) -> WrittenBitmapsStats {
    let mut total_bitmap_bytes = 0;
    let mut set_bit_count = 0;
    let mut min_bitmap_bytes = std::usize::MAX;
    let mut max_bitmap_bytes = 0;

    let write_log_interval = status_log_interval(bitmap_count, 5);
    for (bitmap_no, (bitmap_key, bitmap)) in bitmaps.enumerate() {
        output.write_all(&bitmap_key).expect("writing bitmap key");
        set_bit_count += bitmap.cardinality() as usize;
        interval_log!(write_log_interval, bitmap_no, bitmap_count, "Writing bitmaps ({})...");
        let bitmap_size = bitmap.get_serialized_size_in_bytes();
        min_bitmap_bytes = min(bitmap_size, min_bitmap_bytes);
        max_bitmap_bytes = max(bitmap_size, max_bitmap_bytes);
        total_bitmap_bytes += bitmap_size;
        output.write_u32::<LittleEndian>(
            bitmap_size.try_into().expect("bitmap is too large")
        ).expect("failed to write bitmap size");
        output.write_all(&bitmap.serialize()).expect("failed to write bitmap");
    };
    println!("{rows} bitmaps have an average size of {avg}, varying between {min} and {max}",
        rows = number(bitmap_count),
        avg = bytes(average_int(total_bitmap_bytes, bitmap_count)),
        min = bytes(min_bitmap_bytes),
        max = bytes(max_bitmap_bytes),
    );
    WrittenBitmapsStats {
        set_bit_count,
        total_bitmap_bytes,
    }
}

fn write_bloom_filter_matrix(output_dir: &PathBuf, matrix: &Vec<Bitmap>, bits: usize, documents: usize) -> () {
    let output = File::create(output_dir.join("matrix.bin")).expect("opening output file for matrix");
    let total_bit_count = bits * documents;
    let uncompressed_size: usize = ((total_bit_count as f64) / 8.0).ceil() as usize;
    let WrittenBitmapsStats { set_bit_count, total_bitmap_bytes } = write_bitmaps(output, matrix.iter().map(|bitmap| (Vec::with_capacity(0), bitmap)), bits);
    println!("Final matrix size: {} ({} of uncompressed), with {} of {} bits set ({})",
        bytes(total_bitmap_bytes),
        frac_perc(total_bitmap_bytes, uncompressed_size),
        number(set_bit_count),
        number(total_bit_count),
        frac_perc(set_bit_count, total_bit_count),
    );
}

fn write_postings_list(output_dir: &PathBuf, postings_list: &Vec<Bitmap>, terms: &Vec<Term>) -> () {
    let output = File::create(output_dir.join("postings.list")).expect("opening output file for postings list");
    let WrittenBitmapsStats { set_bit_count, total_bitmap_bytes } = write_bitmaps(output, postings_list.iter().enumerate().map(|(term_id, bitmap)| {
        let mut key = Vec::new();
        key.write_u32::<LittleEndian>(key.len().try_into().expect("term is too long")).expect("write term length to vector");
        key.extend(&terms[term_id]);
        (key, bitmap)
    }), postings_list.len());
    println!("Final postings list size: {}",
        bytes(total_bitmap_bytes),
    );
}

pub struct BuildConfig {
    pub document_encoding: DocumentEncoding,
    pub document_terms_source: File,
    pub error: f64,
    pub maximum_query_bytes: usize,
    pub maximum_query_results: usize,
    pub name: String,
    pub output_dir: PathBuf,
    pub popular: f64,
}

pub fn build(BuildConfig {
    document_encoding,
    document_terms_source,
    error,
    maximum_query_bytes,
    maximum_query_results,
    name,
    output_dir,
    popular,
}: BuildConfig) -> () {
    assert!(error > 0.0 && error < 1.0);
    // If popular is zero, bloom filter matrix is not used.
    // If popular is one, postings list is not used.
    assert!(popular >= 0.0 && popular <= 1.0);

    let mut postings_list_combined_values_bytes: usize = 0;
    let mut postings_list_combined_keys_bytes: usize = 0;

    // term_id => term.
    let mut terms = Vec::<Term>::new();
    // term => term_id.
    let mut term_ids = HashMap::<Term, TermId>::new();
    // document_id => term_id[].
    let mut terms_by_document = Vec::<Vec<TermId>>::new();
    // term_id => bitmap.
    let mut postings_list = Vec::<Bitmap>::new();
    // document_terms.map(|d| d.len()).sum().
    let mut instance_count = 0usize;
    // term_id => document_terms.filter(|d| d.contains(term_id)).count().
    let mut term_frequency = HashMap::<TermId, usize>::new();

    // - Each document must end with '\0', even if last.
    // - Each document must have at least one term.
    // - Each term must be unique within its document.
    // - Each term must end with '\0', even if last for document or entire index.
    // - Each term must not be empty.
    // - Each term must not contain '\0'.
    for (document_id, term) in TermsReader::new(document_terms_source) {
        // Either document_id is new, which should equal terms_by_document.len(),
        // or it's still the current document.
        match terms_by_document.len() - document_id {
            0 => terms_by_document.push(Vec::<TermId>::new()),
            1 => {}
            _ => unreachable!(),
        };
        let document_terms = terms_by_document.last_mut().unwrap();
        let term_len = term.len();
        postings_list_combined_values_bytes += DOCUMENT_ID_BYTES;
        let term_id = match term_ids.get(&term) {
            Some(term_id) => *term_id,
            None => {
                assert_eq!(terms.len(), postings_list.len());
                let term_id = terms.len() as TermId;
                term_ids.insert(term.to_vec(), term_id);
                terms.push(term);
                postings_list.push(Bitmap::create());
                postings_list_combined_keys_bytes += term_len;
                term_id
            }
        };

        document_terms.push(term_id);
        term_frequency.insert(term_id, term_frequency.get(&term_id).unwrap_or(&0) + 1);
        instance_count += 1;
    };

    let document_count = terms_by_document.len();
    let term_count = term_frequency.len();
    assert!(term_count >= 1000);

    let mut highest_term_freqs = term_frequency
        .iter()
        .map(|(term, count)| (*term, *count))
        .collect::<Vec<(TermId, usize)>>();
    highest_term_freqs.sort_by(|a, b| b.1.cmp(&a.1));

    let popular_cutoff = (popular * instance_count as f64).ceil() as usize;
    let mut popular_instance_count = 0;
    let mut popular_reduced_postings_list_combined_keys_bytes: usize = 0;
    let mut popular_reduced_postings_list_combined_values_bytes: usize = 0;
    let mut popular_terms = HashSet::<TermId>::new();
    for (term_id, count) in highest_term_freqs.iter() {
        if popular_instance_count + *count > popular_cutoff {
            break;
        };
        popular_terms.insert(*term_id);
        popular_instance_count += *count;
        popular_reduced_postings_list_combined_keys_bytes += terms[*term_id].len();
        popular_reduced_postings_list_combined_values_bytes += DOCUMENT_ID_BYTES * *count;
    };

    let popular_term_count = popular_terms.len();
    let mut popular_fully_reachable: usize = 0;
    let mut popular_partially_reachable: usize = 0;
    let mut popular_unreachable: usize = 0;
    for doc in terms_by_document.iter() {
        let mut some = false;
        let mut every = true;
        for term_id in doc {
            if popular_terms.contains(term_id) {
                some = true;
            } else {
                every = false;
            };
        };
        if every {
            popular_fully_reachable += 1;
        } else if some {
            popular_partially_reachable += 1;
        } else {
            popular_unreachable += 1;
        };
    };

    let bits_per_element = -(error.ln() / 2.0f64.ln().powi(2));
    let bits: usize = (bits_per_element * popular_term_count as f64).ceil() as usize;
    let hashes: usize = (2.0f64.ln() * bits_per_element).ceil() as usize;

    println!();
    println!("Information about worker \"{}\":", name);
    println!("- There are {docs} documents, each having between {min} and {max} instances with an average of {avg}.",
        docs = number(document_count),
        min = terms_by_document.iter().map(|t| t.len()).min().unwrap(),
        max = terms_by_document.iter().map(|t| t.len()).max().unwrap(),
        avg = number(average_int(instance_count, document_count)),
    );
    println!("- {popular_term_count} of {term_count} terms ({popular_terms_pc}) represent {popular_instance_count} of {instance_count} ({popular_instance_count_pc}) instances, reaching {popular_fully_reachable} ({popular_fully_reachable_pc}) documents fully and {popular_partially_reachable} ({popular_partially_reachable_pc}) partially, and not reaching {popular_unreachable} ({popular_unreachable_pc}) at all.",
        popular_term_count = number(popular_term_count),
        term_count = number(term_count),
        popular_terms_pc = frac_perc(popular_term_count, term_count),
        popular_instance_count = number(popular_instance_count),
        instance_count = number(instance_count),
        popular_instance_count_pc = frac_perc(popular_instance_count, instance_count),
        popular_fully_reachable = number(popular_fully_reachable),
        popular_fully_reachable_pc = frac_perc(popular_fully_reachable, document_count),
        popular_partially_reachable = number(popular_partially_reachable),
        popular_partially_reachable_pc = frac_perc(popular_partially_reachable, document_count),
        popular_unreachable = number(popular_unreachable),
        popular_unreachable_pc = frac_perc(popular_unreachable, document_count),
    );
    println!("- The bloom filter matrix will have {bits} bits per document (i.e. rows), {bpe} bits per element, and {hashes} hashes.",
        bits = number(bits),
        bpe = round2(bits_per_element),
        hashes = hashes,
    );

    println!("- Use of the bloom filter reduces postings list size by {} ({}) in keys and {} ({}) in values, bring them to {} and {} respectively.",
        bytes(popular_reduced_postings_list_combined_keys_bytes),
        frac_perc(popular_reduced_postings_list_combined_keys_bytes, postings_list_combined_keys_bytes),
        bytes(popular_reduced_postings_list_combined_values_bytes),
        frac_perc(popular_reduced_postings_list_combined_values_bytes, postings_list_combined_values_bytes),
        bytes(postings_list_combined_keys_bytes - popular_reduced_postings_list_combined_keys_bytes),
        bytes(postings_list_combined_values_bytes - popular_reduced_postings_list_combined_values_bytes),
    );

    println!("- Top 20 terms: ");
    for (no, (term_id, count)) in highest_term_freqs[..20].iter().enumerate() {
        println!("  {:>2}. {:<25} ({} instances)", no + 1, std::str::from_utf8(&terms[*term_id]).unwrap(), number(*count));
    };
    println!();

    // This is a matrix. Each bit is represented by a bit set with `document_count` bits.
    // For example, assume "hello" is in document with index 5 and hashes to bits {3, 7, 10}.
    // Then the bit sets for bits {3, 7, 10} have their 5th bit set to 1.
    let mut matrix = Vec::<Bitmap>::with_capacity(bits);
    for _ in 0..bits {
        matrix.push(Bitmap::create());
    };

    let hash_log_interval = status_log_interval(document_count, 10);
    for (document_id, doc_terms) in terms_by_document.iter().enumerate() {
        interval_log!(hash_log_interval, document_id, document_count, "Hashing documents ({})...");
        for term_id in doc_terms {
            if popular_terms.contains(term_id) {
                // This is a popular term, so add it to the bloom filter matrix instead of the postings list.
                let [a, b] = mmh3_x64_128(terms[*term_id].to_vec(), 0);
                for i in 0..hashes {
                    let bit: usize = ((a * (b + (i as u64))) % (bits as u64)) as usize;
                    matrix[bit].add(document_id as u32);
                };
            } else {
                // Add to the postings list.
                postings_list[*term_id].add(document_id.try_into().expect("too many documents"));
            };
        };
    };

    println!();
    if popular_partially_reachable + popular_fully_reachable == 0 {
        println!("Matrix is not utilised");
    } else {
        println!("Optimising matrix...");
        for bitmap in matrix.iter_mut() {
            bitmap.run_optimize();
        };
        write_bloom_filter_matrix(&output_dir, &matrix, bits, document_count);
    };

    println!();
    println!("Optimising postings list...");
    for bitmap in postings_list.iter_mut() {
        bitmap.run_optimize();
    };
    write_postings_list(&output_dir, &postings_list, &terms);
}
