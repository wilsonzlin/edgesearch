use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use crate::build::DataStore;

const WORKER_JS_MAIN_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");

pub fn generate_worker_js(
    output_dir: &PathBuf,
    data_store: DataStore,
    data_store_url_prefix: Option<String>,
    document_count: usize,
    max_query_terms: usize,
    max_results: usize,
) -> () {
    // Keep in sync with variables declared in script/src/**/*.ts.
    let js = format!(r#"
        const DATA_STORE = "{DATA_STORE}";
        const DATASTORE_URL_PREFIX = {DATASTORE_URL_PREFIX};
        const DOCUMENT_COUNT = {DOCUMENT_COUNT};
        const MAX_QUERY_TERMS = {MAX_QUERY_TERMS};
        const MAX_RESULTS = {MAX_RESULTS};
        {WORKER_JS_TEMPLATE}
    "#,
        DATA_STORE = match data_store {
            DataStore::KV => "kv",
            DataStore::URL => "url",
        },
        DATASTORE_URL_PREFIX = data_store_url_prefix.map_or("undefined".to_string(), |prefix| format!("`{}`", prefix)),
        DOCUMENT_COUNT = document_count,
        MAX_QUERY_TERMS = max_query_terms,
        MAX_RESULTS = max_results,
        WORKER_JS_TEMPLATE = WORKER_JS_MAIN_TEMPLATE
    );

    File::create(output_dir.join("worker.js")).expect("create worker.js file").write_all(js.as_bytes()).expect("write worker.js");
}
