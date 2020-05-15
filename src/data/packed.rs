use std::convert::TryInto;
use std::fs::File;
use std::io::{BufReader, ErrorKind, Read, Write};
use std::path::PathBuf;

use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};

pub fn write_chunks(output_dir: &PathBuf, name: &str, serialised_entries: &Vec<Vec<u8>>) -> () {
    let mut output = File::create(output_dir.join(format!("{}.packed", name))).expect("opening output file for packed entries");
    for entry_data in serialised_entries.iter() {
        output.write_u32::<BigEndian>(entry_data.len().try_into().expect("too much data")).expect("write package length");
        output.write_all(entry_data).expect("write package data");
    };
}

pub struct ChunksReader {
    reader: BufReader<File>,
}

impl ChunksReader {
    pub fn new(output_dir: &PathBuf, name: &str) -> ChunksReader {
        ChunksReader {
            reader: BufReader::new(File::open(output_dir.join(format!("{}.packed", name))).expect("open packed entries file")),
        }
    }
}

impl Iterator for ChunksReader {
    type Item = Vec<u8>;

    fn next(&mut self) -> Option<Self::Item> {
        match self.reader.read_u32::<BigEndian>() {
            Ok(chunk_len) => {
                let mut chunk_data = vec![0u8; chunk_len as usize];
                self.reader.read_exact(&mut chunk_data).expect("read chunk data");
                Some(chunk_data)
            }
            Err(err) if err.kind() == ErrorKind::UnexpectedEof => None,
            Err(err) => panic!("Failed to read chunk with {}", err),
        }
    }
}
