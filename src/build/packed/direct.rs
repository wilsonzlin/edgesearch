use crate::build::packed::PackedEntryKey;

pub struct PackedEntriesWithDirectLookup {
    lookup: String,
    max_lookup_len: usize,
    packages: Vec<Vec<u8>>,
    max_package_size: usize,
}

impl PackedEntriesWithDirectLookup {
    pub fn new(max_package_size: usize, max_lookup_len: usize) -> PackedEntriesWithDirectLookup {
        PackedEntriesWithDirectLookup {
            lookup: String::new(),
            max_lookup_len,
            packages: Vec::new(),
            max_package_size,
        }
    }

    pub fn insert<K: PackedEntryKey>(&mut self, key: &K, value: &[u8]) -> bool {
        if self.packages.last().filter(|p| p.len() + value.len() <= self.max_package_size).is_none() {
            self.packages.push(Vec::new());
        };

        let package_id = self.packages.len() - 1;
        let packed_offset = self.packages.last().unwrap().len();

        let lookup_entry = format!(r#"[{key_js},{package_id},{packed_offset},{len}],"#,
            key_js = key.js(),
            package_id = package_id,
            packed_offset = packed_offset,
            len = value.len(),
        );
        if self.lookup.len() + lookup_entry.len() > self.max_lookup_len {
            return false;
        };

        self.packages.last_mut().unwrap().extend(value);
        self.lookup.push_str(lookup_entry.as_str());
        true
    }

    pub fn get_packages(&self) -> &Vec<Vec<u8>> {
        &self.packages
    }

    pub fn get_raw_lookup(&self) -> &str {
        &self.lookup
    }
}
