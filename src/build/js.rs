use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

const WORKER_JS_TEMPLATE: &'static str = include_str!("../../script/dist/main.js");

pub fn generate_worker_js(output_dir: &PathBuf, max_query_bytes: usize, max_query_terms: usize) -> () {
    let js = WORKER_JS_TEMPLATE
        // Keep in sync with variables declared in script/src/main.ts.
        .replace(r#""use strict";"#, format!(r#"
            const MAX_QUERY_BYTES = {MAX_QUERY_BYTES};
            const MAX_QUERY_TERMS = {MAX_QUERY_TERMS};
        "#,
            MAX_QUERY_BYTES = max_query_bytes,
            MAX_QUERY_TERMS = max_query_terms,
        ).as_str());

    File::create(output_dir.join("worker.js")).expect("create worker.js file").write_all(js.as_bytes()).expect("write worker.js");
}
