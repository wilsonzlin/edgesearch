use std::cmp::{max, min};
use std::convert::TryInto;
use std::fs::File;
use std::io::Write;

use byteorder::{LittleEndian, WriteBytesExt};
use croaring::Bitmap;

use crate::util::format::{average_int, bytes, number};
use crate::util::format::percent;
use crate::util::log::status_log_interval;

pub struct WrittenBitmapsStats {
    pub set_bit_count: usize,
    pub total_bitmap_bytes: usize,
}

pub fn write_bitmaps<'b, T: Iterator<Item=(Vec<u8>, &'b Bitmap)>>(mut output: File, bitmaps: T, bitmap_count: usize) -> WrittenBitmapsStats {
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
