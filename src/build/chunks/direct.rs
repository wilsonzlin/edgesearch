use crate::build::chunks::ChunkEntryKey;

pub struct ChunksWithDirectLookup {
    lookup: String,
    max_lookup_len: usize,
    chunks: Vec<Vec<u8>>,
    max_chunk_size: usize,
}

impl ChunksWithDirectLookup {
    pub fn new(max_chunk_size: usize, max_lookup_len: usize) -> ChunksWithDirectLookup {
        ChunksWithDirectLookup {
            lookup: String::new(),
            max_lookup_len,
            chunks: Vec::new(),
            max_chunk_size,
        }
    }

    pub fn insert<K: ChunkEntryKey>(&mut self, key: &K, value: &[u8]) -> bool {
        if self.chunks.last().filter(|p| p.len() + value.len() <= self.max_chunk_size).is_none() {
            self.chunks.push(Vec::new());
        };

        let chunk_id = self.chunks.len() - 1;
        let offset_in_chunk = self.chunks.last().unwrap().len();

        let lookup_entry = format!(r#"[{key_js},{chunk_id},{offset_in_chunk},{len}],"#,
            key_js = key.js(),
            chunk_id = chunk_id,
            offset_in_chunk = offset_in_chunk,
            len = value.len(),
        );
        if self.lookup.len() + lookup_entry.len() > self.max_lookup_len {
            return false;
        };

        self.chunks.last_mut().unwrap().extend(value);
        self.lookup.push_str(lookup_entry.as_str());
        true
    }

    pub fn get_chunks(&self) -> &Vec<Vec<u8>> {
        &self.chunks
    }

    pub fn get_raw_lookup(&self) -> &str {
        &self.lookup
    }
}
