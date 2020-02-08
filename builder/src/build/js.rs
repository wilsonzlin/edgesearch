use serde::{Deserialize, Serialize};

use crate::data::documents::DocumentEncoding;

const WORKER_JS_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");

#[allow(non_snake_case)]
#[derive(Serialize, Deserialize)]
// Keep in sync with variables declared in resources/worker.config.ts.
struct WorkerConfigObject {
    DOCUMENT_ENCODING: String,
    MAX_QUERY_WORDS: usize,
    WORKER_NAME: String,
}

pub fn create_worker_js(name: &String, document_encoding: DocumentEncoding, max_query_words: usize, worker_name: &String) -> String {
    WORKER_JS_TEMPLATE
        // `exports` is not defined in Workers environment.
        .replace(r#"Object.defineProperty(exports, "__esModule", { value: true });"#, "")
        .replace(r#"require("./worker.config")"#, &serde_json::to_string(&WorkerConfigObject {
            DOCUMENT_ENCODING: document_encoding.to_string(),
            MAX_QUERY_WORDS: max_query_words,
            WORKER_NAME: name.clone(),
        }).expect("create worker.js configuration object"))
}
