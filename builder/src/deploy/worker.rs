use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use reqwest::blocking::{Client, multipart};

const METADATA: &'static str = r#"{"body_part":"script","bindings":[{"name":"QUERY_RUNNER_WASM","type":"wasm_module","part":"wasm"}]}"#;

pub fn publish_worker(client: &Client, output_dir: &PathBuf, name: &String, account_id: &String, api_token: &String) -> () {
    let mut worker_js = Vec::new();
    File::open(output_dir.join("worker.js")).expect("open worker.js").read_to_end(&mut worker_js).expect("read worker.js");
    let mut runner_wasm = Vec::new();
    File::open(output_dir.join("runner.wasm")).expect("open runner.wasm").read_to_end(&mut runner_wasm).expect("read runner.wasm");

    let worker_form = multipart::Form::new()
        .text("metadata", METADATA)
        .part("script", multipart::Part::bytes(worker_js))
        .part("wasm", multipart::Part::bytes(runner_wasm));

    println!("Uploading worker...");
    client.put(format!("https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{name}", account_id = account_id, name = name).as_str())
        .bearer_auth(&api_token)
        .multipart(worker_form)
        .send()
        .expect("uploading worker");
}
