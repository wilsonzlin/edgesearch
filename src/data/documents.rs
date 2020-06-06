use std::fs::File;
use std::io::BufReader;

use crate::data::read_null_terminated;

pub struct DocumentsReader {
    reader: BufReader<File>,
    next_document_id: usize,
}

impl DocumentsReader {
    pub fn new(input: File) -> DocumentsReader {
        DocumentsReader {
            reader: BufReader::new(input),
            next_document_id: 0,
        }
    }
}

impl Iterator for DocumentsReader {
    type Item = (usize, String);

    fn next(&mut self) -> Option<Self::Item> {
        read_null_terminated(&mut self.reader).map(|data| {
            let doc_id = self.next_document_id;
            self.next_document_id += 1;
            (doc_id, String::from_utf8(data).expect("parsing document as UTF-8"))
        })
    }
}
