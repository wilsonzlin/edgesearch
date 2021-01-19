use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use crate::build::DataStore;

const WORKER_JS_MAIN_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");
const WORKER_JS_DATA_SOURCE_KV: &'static str = include_str!("../../script/dist/datastore/kv.js");
const WORKER_JS_DATA_SOURCE_URL: &'static str = include_str!("../../script/dist/datastore/url.js");

pub fn generate_worker_js(
    output_dir: &PathBuf,
    data_store: DataStore,
    data_store_url_prefix: Option<String>,
    document_count: usize,
    max_query_terms: usize,
    max_results: usize,
) -> () {
    let js = WORKER_JS_MAIN_TEMPLATE
        // Keep in sync with variables declared in script/src/**/*.ts.
        .replace(r#""use strict";"#, format!(r#"
            const DATASTORE_URL_PREFIX = {DATASTORE_URL_PREFIX};
            const DOCUMENT_COUNT = {DOCUMENT_COUNT};
            const MAX_QUERY_TERMS = {MAX_QUERY_TERMS};
            const MAX_RESULTS = {MAX_RESULTS};
            {DATA_SOURCE_JS}
        "#,
            DATASTORE_URL_PREFIX = data_store_url_prefix.map_or("undefined".to_string(), |prefix| format!("`{}`", prefix)),
            DOCUMENT_COUNT = document_count,
            MAX_QUERY_TERMS = max_query_terms,
            MAX_RESULTS = max_results,
            DATA_SOURCE_JS = match data_store {
                DataStore::KV => WORKER_JS_DATA_SOURCE_KV,
                DataStore::URL => WORKER_JS_DATA_SOURCE_URL,
            },
        ).as_str());

    File::create(output_dir.join("worker.js")).expect("create worker.js file").write_all(js.as_bytes()).expect("write worker.js");
}
