use std::fs::File;
use std::path::PathBuf;

use croaring::Bitmap;

use crate::data::bitmaps::{write_bitmaps, WrittenBitmapsStats};
use crate::util::format::{bytes, frac_perc, number};

pub fn write_bloom_filter_matrix(output_dir: &PathBuf, matrix: &Vec<Bitmap>, bits: usize, documents: usize) -> () {
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
