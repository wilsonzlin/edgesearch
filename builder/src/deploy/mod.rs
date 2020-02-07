use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use reqwest::blocking::{Client, multipart};

use crate::data::documents::DocumentsReader;
use crate::data::postings_list::PostingsListReader;
use crate::deploy::kv::{KV_MAX_BATCH_SIZE, upload_kv_batch};

mod kv;

const METADATA: &'static str = r#"{"body_part":"script","bindings":[{"name":"QUERY_RUNNER_WASM","type":"wasm_module","part":"wasm"}]}"#;

pub struct DeployConfig {
    account_id: String,
    api_token: String,
    documents: File,
    name: String,
    output_dir: PathBuf,
}

pub fn deploy(DeployConfig {
    account_id,
    api_token,
    documents,
    name,
    output_dir,
}: DeployConfig) -> () {
    let client = Client::new();
    let kv_namespace = format!("EDGESEARCH_{}", name);

    let process_batch = |batch: &mut HashMap<String, String>, base64: bool| -> () {
        upload_kv_batch(&client, batch, &account_id, &api_token, &kv_namespace, base64);
        batch.clear();
    };

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

    let mut documents_batch = HashMap::<String, String>::new();
    for (document_id, document) in DocumentsReader::new(documents) {
        documents_batch.insert(
            format!("doc_{}", document_id),
            document,
        );

        if documents_batch.len() == KV_MAX_BATCH_SIZE {
            println!("Uploading documents up to {}...", document_id);
            process_batch(&mut documents_batch, false);
        };
    };
    process_batch(&mut documents_batch, false);

    let mut postings_list_entries_batch = HashMap::<String, String>::new();
    for (entry_no, (term, bitmap)) in PostingsListReader::new(&output_dir).enumerate() {
        postings_list_entries_batch.insert(
            format!("postingslist_{}", term),
            base64::encode(&bitmap),
        );
        if postings_list_entries_batch.len() == KV_MAX_BATCH_SIZE {
            println!("Uploading postings list entries up to {}...", entry_no);
            process_batch(&mut postings_list_entries_batch, true);
        };
    };
    process_batch(&mut postings_list_entries_batch, true);
}
