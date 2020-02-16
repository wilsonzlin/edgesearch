use std::convert::TryInto;
use std::io::Write;

use byteorder::{BigEndian, WriteBytesExt};

use crate::build::packed::PackedEntryKey;

struct BST<K: PackedEntryKey> {
    values: Vec<(K, Vec<u8>)>,
    serialised_len: usize,
}

impl<K: PackedEntryKey> BST<K> {
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
        out.write_i32::<BigEndian>(left_pos).expect("write package data");
        out.write_i32::<BigEndian>(right_pos).expect("write package data");
        out.write_u32::<BigEndian>(value_len).expect("write package data");
        out.write_all(value).expect("write package data");
        pos
    }

    fn _serialise_area(&self, out: &mut Vec<u8>, lo: usize, hi: usize) -> i32 {
        // Serialise nodes with indices in the range [lo, hi] (inclusive).
        // Return the position of the first byte of the serialised middle node.

        // Add first to prevent underflow.
        let dist = hi + 1 - lo;
        match dist {
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
            _ => {
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

pub struct PackedEntriesWithBSTLookup<K: PackedEntryKey> {
    packages: Vec<BST<K>>,
    max_package_size: usize,
}

impl<K: PackedEntryKey> PackedEntriesWithBSTLookup<K> {
    pub fn new(max_package_size: usize) -> PackedEntriesWithBSTLookup<K> {
        PackedEntriesWithBSTLookup {
            packages: Vec::new(),
            max_package_size,
        }
    }

    pub fn insert(&mut self, key: K, value: Vec<u8>) -> () {
        if self.packages.last().filter(|p| p.serialised_len() + BST::<K>::insertion_cost(&key, &value) <= self.max_package_size).is_none() {
            self.packages.push(BST::new());
        };

        self.packages.last_mut().unwrap().insert(key, value);
    }

    pub fn package_count(&self) -> usize {
        self.packages.len()
    }

    pub fn serialise(&self) -> (String, Vec<Vec<u8>>) {
        let mut lookup = String::new();
        let mut serialised_packages = Vec::new();

        for (package_id, package) in self.packages.iter().enumerate() {
            let (mid_pos, serialised) = package.serialise();
            let lookup_entry = format!(r#"[{key},{package_id},{middle}],"#,
                key = package.first_key().unwrap().js(),
                package_id = package_id,
                middle = mid_pos,
            );
            lookup.push_str(lookup_entry.as_str());
            serialised_packages.push(serialised);
        };

        (lookup, serialised_packages)
    }
}
