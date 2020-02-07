use std::cmp::{max, min};
use std::convert::TryInto;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use byteorder::{LittleEndian, WriteBytesExt};
use croaring::Bitmap;

use crate::Term;
use crate::util::format::{average_int, bytes, frac_perc, number};
use crate::util::format::percent;
use crate::util::log::status_log_interval;

pub(crate) struct WrittenBitmapsStats {
    set_bit_count: usize,
    total_bitmap_bytes: usize,
}

pub(crate) fn write_bitmaps<'b, T: Iterator<Item=(Vec<u8>, &'b Bitmap)>>(mut output: File, bitmaps: T, bitmap_count: usize) -> WrittenBitmapsStats {
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

pub(crate) fn write_bloom_filter_matrix(output_dir: &PathBuf, matrix: &Vec<Bitmap>, bits: usize, documents: usize) -> () {
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

pub(crate) fn write_postings_list(output_dir: &PathBuf, postings_list: &Vec<Bitmap>, terms: &Vec<Term>) -> () {
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
