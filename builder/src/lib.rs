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
    ($interval:ident, $no:ident, $len:ident, $fmt:literal) => {
        if $no % $interval == 0 {
            println!($fmt, percent($no as f64 / $len as f64));
        };
    };
}

fn status_log_interval(len: usize, times: usize) -> usize {
    1 << (((len as f64) / (times as f64)).log2().ceil() as usize)
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

    let document_terms_file_size: usize = document_terms_source.metadata().unwrap().len() as usize;
    let mut postings_list_combined_values_bytes: usize = 0;
    let mut postings_list_combined_keys_bytes: usize = 0;
    let mut document_terms_reader = BufReader::new(document_terms_source);

    // term_id => term.
    let mut terms = Vec::<Term>::new();
    // term => term_id.
    let mut term_ids = HashMap::<Term, TermId>::new();
    // document_id => term_id[].
    let mut document_terms = Vec::<Vec<TermId>>::new();
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
    let mut total_bytes_read = 0usize;
    let read_log_interval = status_log_interval(document_terms_file_size, 200);
    'outer: loop {
        interval_log!(read_log_interval, total_bytes_read, document_terms_file_size, "Reading document terms ({})...");
        document_terms.push(Vec::<TermId>::new());
        let document = document_terms.last_mut().unwrap();

        loop {
            let mut term = Term::new();

            let bytes_read = document_terms_reader.read_until(b'\0', &mut term).expect("reading term");
            total_bytes_read += bytes_read;
            match bytes_read {
                // End of file.
                0 => break 'outer,
                // End of document.
                1 => break,
                _ => {}
            };

            // Remove null terminator.
            term.pop().filter(|c| *c == b'\0').expect("removal of null terminator");
            let term_len = term.len();
            postings_list_combined_values_bytes += DOCUMENT_ID_BYTES;

            let term_id = match term_ids.get(&term) {
                Some(term_id) => *term_id,
                None => {
                    let term_id = terms.len() as TermId;
                    term_ids.insert(term.to_vec(), term_id);
                    terms.push(term);
                    postings_list_combined_keys_bytes += term_len;
                    term_id
                }
            };

            document.push(term_id);
            term_frequency.insert(term_id, term_frequency.get(&term_id).unwrap_or(&0) + 1);
            instance_count += 1;
        };
        assert!(!document_terms.is_empty());
    };
    // Due to the layout of the file and the way we read it, the previous outer loop runs once at EOF, creating a non-existent empty document.
    document_terms.pop().filter(|d| d.is_empty()).expect("removal of dummy document");

    let document_count = document_terms.len();
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
    for doc in document_terms.iter() {
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
    let uncompressed_matrix_size: usize = (((bits * document_count) as f64) / 8.0).ceil() as usize;

    println!();
    println!("Information about worker \"{}\":", name);
    println!("- There are {docs} documents, each having between {min} and {max} instances with an average of {avg}.",
        docs = number(document_count),
        min = document_terms.iter().map(|t| t.len()).min().unwrap(),
        max = document_terms.iter().map(|t| t.len()).max().unwrap(),
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
    println!("- The bloom filter matrix will have an uncompressed size of {size}, with {bits} bits per document (i.e. rows), {bpe} bits per element, and {hashes} hashes.",
        size = bytes(uncompressed_matrix_size),
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
    for (document_id, doc_terms) in document_terms.iter().enumerate() {
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
                // TODO
            };
        };
    };
    println!("Optimising matrix...");
    let mut matrix_output = File::create(output_dir.join("matrix.bin")).expect("opening output file for matrix");
    let mut matrix_size = 0;
    let mut set_bit_count = 0;
    let mut min_row_size = std::usize::MAX;
    let mut max_row_size = 0;
    let total_bit_count = bits * document_count;
    let write_log_interval = status_log_interval(bits, 5);
    for (row_no, bitmap) in matrix.iter_mut().enumerate() {
        set_bit_count += bitmap.cardinality() as usize;
        interval_log!(write_log_interval, row_no, bits, "Writing rows ({})...");
        bitmap.run_optimize();
        let bitmap_size = bitmap.get_serialized_size_in_bytes();
        min_row_size = min(bitmap_size, min_row_size);
        max_row_size = max(bitmap_size, max_row_size);
        matrix_size += bitmap_size;
        matrix_output.write_u32::<LittleEndian>(bitmap_size.try_into().expect("matrix row is too large")).expect("failed to write matrix row size");
        matrix_output.write_all(&bitmap.serialize()).expect("failed to write matrix row");
    };
    println!("Final matrix size: {} ({} of uncompressed), with {} of {} bits set ({})",
        bytes(matrix_size),
        frac_perc(matrix_size, uncompressed_matrix_size),
        number(set_bit_count),
        number(total_bit_count),
        frac_perc(set_bit_count, total_bit_count),
    );
    println!("{rows} rows have an average size of {avg}, varying between {min} and {max}",
        rows = number(bits),
        avg = bytes(average_int(matrix_size, bits)),
        min = bytes(min_row_size),
        max = bytes(max_row_size),
    );
}
