use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

const WORKER_JS_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");

pub fn generate_worker_js(output_dir: &PathBuf, document_count: usize, max_query_terms: usize, max_results: usize) -> () {
    let js = WORKER_JS_TEMPLATE
        // Keep in sync with variables declared in script/src/main.ts.
        .replace(r#""use strict";"#, format!(r#"
            const DOCUMENT_COUNT = {DOCUMENT_COUNT};
            const MAX_QUERY_TERMS = {MAX_QUERY_TERMS};
            const MAX_RESULTS = {MAX_RESULTS};
        "#,
            DOCUMENT_COUNT = document_count,
            MAX_QUERY_TERMS = max_query_terms,
            MAX_RESULTS = max_results,
        ).as_str());

    File::create(output_dir.join("worker.js")).expect("create worker.js file").write_all(js.as_bytes()).expect("write worker.js");
}
