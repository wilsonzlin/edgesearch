use std::fs::File;
use std::io::{BufReader, Read};
use std::path::PathBuf;

use byteorder::{LittleEndian, ReadBytesExt};
use croaring::Bitmap;

use crate::data::bitmaps::{write_bitmaps, WrittenBitmapsStats};
use crate::data::read_null_terminated;
use crate::Term;
use crate::util::format::bytes;

const FILE_NAME: &'static str = "postings.list";

pub fn write_postings_list(output_dir: &PathBuf, postings_list: &Vec<Bitmap>, terms: &Vec<Term>) -> () {
    let output = File::create(output_dir.join(FILE_NAME)).expect("opening output file for postings list");
    let WrittenBitmapsStats { total_bitmap_bytes, .. } = write_bitmaps(output, postings_list.iter().enumerate().map(|(term_id, bitmap)| {
        let mut key = terms[term_id].clone();
        key.push(b'\0');
        (key, bitmap)
    }), postings_list.len());
    println!("Final postings list size: {}", bytes(total_bitmap_bytes));
}

pub struct PostingsListReader {
    reader: BufReader<File>,
}

impl PostingsListReader {
    pub fn new(output_dir: &PathBuf) -> PostingsListReader {
        PostingsListReader {
            reader: BufReader::new(File::open(output_dir.join(FILE_NAME)).expect("open postings list file")),
        }
    }
}

impl Iterator for PostingsListReader {
    type Item = (String, Vec<u8>);

    fn next(&mut self) -> Option<Self::Item> {
        read_null_terminated(&mut self.reader).map(|term| {
            let bitmap_len = self.reader.read_u32::<LittleEndian>().expect("read bitmap length");
            let mut bitmap = vec![0u8; bitmap_len as usize];
            self.reader.read_exact(&mut bitmap).expect("read bitmap");
            (String::from_utf8(term).expect("parse term as UTF-8"), bitmap)
        })
    }
}
