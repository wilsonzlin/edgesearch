use std::convert::TryInto;
use std::io::Write;

use byteorder::{WriteBytesExt, LittleEndian};

use crate::build::chunks::ChunkEntryKey;

struct BST<K: ChunkEntryKey> {
    values: Vec<(K, Vec<u8>)>,
    serialised_len: usize,
}

impl<K: ChunkEntryKey> BST<K> {
    fn new() -> BST<K> {
        BST {
            values: Vec::new(),
            serialised_len: 0,
        }
    }

    fn insertion_cost(key: &K, value: &[u8]) -> usize {
        // Keep in sync with BSTNode::serialise.
        key.bytes().len() + 4 + 4 + 4 + value.len()
    }

    fn first_key(&self) -> Option<&K> {
        self.values.first().map(|(k, _)| k)
    }

    /**
     * WARNING: Key must be greater than any previously inserted key.
     */
    fn insert(&mut self, key: K, value: Vec<u8>) -> () {
        self.serialised_len += BST::<K>::insertion_cost(&key, &value);
        self.values.push((key, value));
    }

    fn _serialise_node(out: &mut Vec<u8>, left_pos: i32, right_pos: i32, key: &K, value: &[u8]) -> i32 {
        let pos: i32 = out.len().try_into().expect("too much data");
        let value_len: u32 = value.len().try_into().expect("value is too long");
        out.write_all(key.bytes()).expect("write package data");
        out.write_i32::<LittleEndian>(left_pos).expect("write package data");
        out.write_i32::<LittleEndian>(right_pos).expect("write package data");
        out.write_u32::<LittleEndian>(value_len).expect("write package data");
        out.write_all(value).expect("write package data");
        pos
    }

    // Serialise nodes with indices in the range [lo, hi] (inclusive).
    // Return the position of the first byte of the serialised middle node.
    fn _serialise_area(&self, out: &mut Vec<u8>, lo: usize, hi: usize) -> i32 {
        // Add first to prevent underflow.
        match hi + 1 - lo {
            0 => unreachable!(),
            1 => {
                let (key, value) = &self.values[lo];
                BST::_serialise_node(out, -1, -1, key, value)
            }
            2 => {
                let (left_key, left_value) = &self.values[lo];
                let (right_key, right_value) = &self.values[hi];
                let left_pos = BST::_serialise_node(out, -1, -1, left_key, left_value);
                BST::_serialise_node(out, left_pos, -1, right_key, right_value)
            }
            dist => {
                let mid = lo + (dist / 2);
                let (key, value) = &self.values[mid];
                let left_pos = self._serialise_area(out, lo, mid - 1);
                let right_pos = self._serialise_area(out, mid + 1, hi);
                BST::_serialise_node(out, left_pos, right_pos, key, value)
            }
        }
    }

    fn serialise(&self) -> (u32, Vec<u8>) {
        let mut out = Vec::<u8>::new();
        let centre_pos = self._serialise_area(&mut out, 0, self.values.len() - 1);
        (centre_pos.try_into().unwrap(), out)
    }

    fn serialised_len(&self) -> usize {
        self.serialised_len
    }
}

pub struct BstChunks<K: ChunkEntryKey> {
    chunks: Vec<BST<K>>,
    max_chunk_size: usize,
}

impl<K: ChunkEntryKey> BstChunks<K> {
    pub fn new(max_chunk_size: usize) -> BstChunks<K> {
        BstChunks {
            chunks: Vec::new(),
            max_chunk_size,
        }
    }

    pub fn insert(&mut self, key: K, value: Vec<u8>) -> () {
        if self.chunks.last().filter(|p| p.serialised_len() + BST::<K>::insertion_cost(&key, &value) <= self.max_chunk_size).is_none() {
            self.chunks.push(BST::new());
        };

        self.chunks.last_mut().unwrap().insert(key, value);
    }

    pub fn chunk_count(&self) -> usize {
        self.chunks.len()
    }

    pub fn serialise(&self) -> (String, Vec<Vec<u8>>) {
        let mut lookup = String::new();
        let mut serialised_chunks = Vec::new();

        for (package_id, package) in self.chunks.iter().enumerate() {
            let (mid_pos, serialised) = package.serialise();
            let lookup_entry = format!(r#"{{
                .id = {package_id},
                .mid_pos = {middle},
                .first_key = {key},
            }},"#,
                key = package.first_key().unwrap().c(),
                package_id = package_id,
                middle = mid_pos,
            );
            lookup.push_str(lookup_entry.as_str());
            serialised_chunks.push(serialised);
        };

        (lookup, serialised_chunks)
    }
}
