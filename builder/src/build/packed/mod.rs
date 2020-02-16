use std::convert::TryInto;
use std::io::Write;

use byteorder::{BigEndian, WriteBytesExt};

pub mod bst;
pub mod direct;

pub trait PackedEntryKey {
    fn bytes(&self) -> &[u8];
    fn js(&self) -> &str;
}

pub struct PackedU32Key {
    bytes: Vec<u8>,
    js: String,
}

impl PackedU32Key {
    pub fn new(key: u32) -> PackedU32Key {
        let mut bytes = Vec::new();
        bytes.write_u32::<BigEndian>(key).unwrap();
        PackedU32Key {
            bytes,
            js: format!("{}", key),
        }
    }
}

impl PackedEntryKey for PackedU32Key {
    fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    fn js(&self) -> &str {
        &self.js
    }
}


pub struct PackedStrKey {
    bytes: Vec<u8>,
    js: String,
}

impl PackedStrKey {
    pub fn new(key: &str) -> PackedStrKey {
        let mut bytes = Vec::new();
        bytes.write_u8(key.len().try_into().expect("key is too long")).unwrap();
        bytes.write_all(key.as_bytes()).unwrap();
        PackedStrKey {
            bytes,
            js: format!("\"{}\"", key.replace("\n", "\\n").replace("\"", "\\\"")),
        }
    }
}

impl PackedEntryKey for PackedStrKey {
    fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    fn js(&self) -> &str {
        &self.js
    }
}
