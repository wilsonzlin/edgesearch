use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::data::documents::DocumentEncoding;

const WORKER_JS_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");

#[allow(non_snake_case)]
#[derive(Serialize, Deserialize)]
// Keep in sync with variables declared in builder/script/src/config.ts.
struct WorkerConfigObject {
    DEFAULT_RESULTS: String,
    DOCUMENT_ENCODING: String,
    MAX_QUERY_BYTES: usize,
    MAX_QUERY_TERMS: usize,
}

pub fn generate_worker_js(output_dir: &PathBuf, document_encoding: DocumentEncoding, default_results: &str, max_query_bytes: usize, max_query_terms: usize) -> () {
    let js = WORKER_JS_TEMPLATE
        // `exports` is not defined in Workers environment.
        .replace(r#"Object.defineProperty(exports, "__esModule", { value: true });"#, "")
        .replace(r#"require("./config")"#, &serde_json::to_string(&WorkerConfigObject {
            DEFAULT_RESULTS: default_results.to_string(),
            DOCUMENT_ENCODING: document_encoding.to_string(),
            MAX_QUERY_BYTES: max_query_bytes,
            MAX_QUERY_TERMS: max_query_terms,
        }).expect("create worker.js configuration object"));

    File::create(output_dir.join("worker.js")).expect("create worker.js file").write_all(js.as_bytes()).expect("write worker.js");
}
