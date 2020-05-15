use std::convert::TryInto;
use std::io::Write;

use byteorder::{BigEndian, WriteBytesExt};

pub mod bst;
pub mod direct;

pub trait ChunkEntryKey {
    fn bytes(&self) -> &[u8];
    fn js(&self) -> &str;
}

pub struct ChunkU32Key {
    bytes: Vec<u8>,
    js: String,
}

impl ChunkU32Key {
    pub fn new(key: u32) -> ChunkU32Key {
        let mut bytes = Vec::new();
        bytes.write_u32::<BigEndian>(key).unwrap();
        ChunkU32Key {
            bytes,
            js: format!("{}", key),
        }
    }
}

impl ChunkEntryKey for ChunkU32Key {
    fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    fn js(&self) -> &str {
        &self.js
    }
}


pub struct ChunkStrKey {
    bytes: Vec<u8>,
    js: String,
}

impl ChunkStrKey {
    pub fn new(key: &str) -> ChunkStrKey {
        let mut bytes = Vec::new();
        bytes.write_u8(key.len().try_into().expect("key is too long")).unwrap();
        bytes.write_all(key.as_bytes()).unwrap();
        ChunkStrKey {
            bytes,
            js: format!("\"{}\"", key.replace("\n", "\\n").replace("\"", "\\\"")),
        }
    }
}

impl ChunkEntryKey for ChunkStrKey {
    fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    fn js(&self) -> &str {
        &self.js
    }
}
