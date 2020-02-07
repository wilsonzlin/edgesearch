use std::convert::TryInto;
use std::fs::File;
use std::io::{BufRead, BufReader};

use crate::Term;
use crate::util::format::percent;
use crate::util::log::status_log_interval;

pub struct DocumentTermsReader {
    reader: BufReader<File>,
    next_document_id: usize,
    bytes_read: usize,
    eof: bool,
    log_interval: usize,
    total_bytes: usize,
}

impl DocumentTermsReader {
    pub fn new(input: File) -> DocumentTermsReader {
        let file_bytes: usize = input.metadata().unwrap().len().try_into().expect("file is too large");
        DocumentTermsReader {
            reader: BufReader::new(input),
            next_document_id: 0,
            bytes_read: 0,
            eof: false,
            log_interval: status_log_interval(file_bytes, 20),
            total_bytes: file_bytes,
        }
    }
}

impl Iterator for DocumentTermsReader {
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
                    self.next_document_id += 1;
                }
                _ => {
                    // Remove null terminator.
                    term.pop().filter(|c| *c == b'\0').expect("removal of null terminator");
                    return Some((self.next_document_id, term));
                }
            };
        }
    }
}
