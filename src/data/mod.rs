use std::fs::File;
use std::io::{BufRead, BufReader};

pub mod document_terms;
pub mod documents;

fn read_null_terminated(reader: &mut BufReader<File>) -> Option<Vec<u8>> {
    let mut data = Vec::<u8>::new();
    let bytes_read = reader.read_until(b'\0', &mut data).expect("reading");
    match bytes_read {
        0 => None,
        _ => {
            // Remove null terminator.
            data.pop().filter(|c| *c == b'\0').expect("removal of null terminator");
            Some(data)
        }
    }
}
