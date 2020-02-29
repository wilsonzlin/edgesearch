use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use crate::data::documents::DocumentEncoding;

const WORKER_JS_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");

pub fn generate_worker_js(output_dir: &PathBuf, document_encoding: DocumentEncoding, max_query_bytes: usize, max_query_terms: usize, popular_postings_list_lookup_raw: &str, normal_postings_list_lookup_raw: &str, documents_lookup_raw: &str) -> () {
    let js = WORKER_JS_TEMPLATE
        // Keep in sync with variables declared in script/src/main.ts.
        .replace(r#""use strict";"#, format!(r#"
            const DOCUMENT_ENCODING = "{DOCUMENT_ENCODING}";
            const MAX_QUERY_BYTES = {MAX_QUERY_BYTES};
            const MAX_QUERY_TERMS = {MAX_QUERY_TERMS};
            const PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_RAW = [{PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_RAW}];
            const PACKED_NORMAL_POSTINGS_LIST_ENTRIES_LOOKUP = [{PACKED_NORMAL_POSTINGS_LIST_ENTRIES_LOOKUP}];
            const PACKED_DOCUMENTS_LOOKUP = [{PACKED_DOCUMENTS_LOOKUP}];
        "#,
            DOCUMENT_ENCODING = document_encoding.to_string(),
            MAX_QUERY_BYTES = max_query_bytes,
            MAX_QUERY_TERMS = max_query_terms,
            PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_RAW = popular_postings_list_lookup_raw,
            PACKED_NORMAL_POSTINGS_LIST_ENTRIES_LOOKUP = normal_postings_list_lookup_raw,
            PACKED_DOCUMENTS_LOOKUP = documents_lookup_raw,
        ).as_str());

    File::create(output_dir.join("worker.js")).expect("create worker.js file").write_all(js.as_bytes()).expect("write worker.js");
}
