use std::convert::TryInto;
use std::io::Write;

use byteorder::{LittleEndian, WriteBytesExt};

pub mod bst;

pub trait ChunkEntryKey {
    fn bytes(&self) -> &[u8];
    fn c(&self) -> &str;
}

pub struct ChunkU32Key {
    bytes: Vec<u8>,
    c: String,
}

impl ChunkU32Key {
    pub fn new(key: u32) -> ChunkU32Key {
        let mut bytes = Vec::new();
        bytes.write_u32::<LittleEndian>(key).unwrap();
        ChunkU32Key {
            bytes,
            c: format!(r#"{{
                .intval = {},
            }}"#, key),
        }
    }
}

impl ChunkEntryKey for ChunkU32Key {
    fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    fn c(&self) -> &str {
        &self.c
    }
}


pub struct ChunkStrKey {
    bytes: Vec<u8>,
    c: String,
}

impl ChunkStrKey {
    pub fn new(key: &str) -> ChunkStrKey {
        let mut bytes = Vec::new();
        bytes.write_u8(key.len().try_into().expect("key is too long")).unwrap();
        bytes.write_all(key.as_bytes()).unwrap();
        ChunkStrKey {
            bytes,
            c: format!(r#"{{
                .strval = {{
                    .val = "{VAL}",
                    .len = {LEN},
                }},
            }}"#,
                VAL = key.replace("\n", "\\n").replace("\"", "\\\""),
                LEN = key.len(),
            ),
        }
    }
}

impl ChunkEntryKey for ChunkStrKey {
    fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    fn c(&self) -> &str {
        &self.c
    }
}
