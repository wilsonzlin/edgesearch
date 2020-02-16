use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use reqwest::blocking::{Client, multipart};
use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::deploy::cfreq::{Body, CFAuth, CFRequestError, make_request};

const METADATA: &'static str = r#"{
    "body_part": "script",
    "bindings": [
        {
            "name": "QUERY_RUNNER_WASM",
            "type": "wasm_module",
            "part": "wasm"
        },
        {
            "name": "KV",
            "type": "kv_namespace",
            "namespace_id": ":KV_NAMESPACE_ID"
        }
    ]
}"#;

#[derive(Serialize, Deserialize)]
struct UploadWorkerResult {
    script: String,
    etag: String,
    size: usize,
    modified_on: String,
}

#[derive(Serialize, Deserialize)]
struct UploadWorkerResponse {
    success: bool,
    errors: Vec<CFRequestError>,
    messages: Vec<String>,
    result: Option<UploadWorkerResult>,
}

pub fn publish_worker(
    client: &Client,
    auth: &CFAuth,
    output_dir: &PathBuf,
    name: &String,
    kv_namespace: &String,
) -> () {
    let mut worker_js = Vec::new();
    File::open(output_dir.join("worker.js")).expect("open worker.js").read_to_end(&mut worker_js).expect("read worker.js");
    let mut runner_wasm = Vec::new();
    File::open(output_dir.join("runner.wasm")).expect("open runner.wasm").read_to_end(&mut runner_wasm).expect("read runner.wasm");

    let worker_form = multipart::Form::new()
        .text("metadata", METADATA.replace(":KV_NAMESPACE_ID", kv_namespace))
        .part("script", multipart::Part::bytes(worker_js))
        .part("wasm", multipart::Part::bytes(runner_wasm));

    println!("Uploading worker...");
    let _: UploadWorkerResponse = make_request(
        client,
        Method::PUT,
        auth,
        format!("/workers/scripts/{}", name),
        Body::Multipart(worker_form),
    );
    println!("Worker uploaded");
}
