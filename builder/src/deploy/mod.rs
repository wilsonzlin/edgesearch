use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;

use reqwest::blocking::Client;

use crate::data::documents::DocumentsReader;
use crate::data::postings_list::PostingsListReader;
use crate::deploy::kv::{KV_MAX_BATCH_SIZE, upload_kv_batch};
use crate::deploy::worker::publish_worker;

mod kv;
mod worker;

pub struct DeployConfig {
    pub account_id: String,
    pub api_token: String,
    pub documents: File,
    pub name: String,
    pub output_dir: PathBuf,
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

    publish_worker(&client, &output_dir, &name, &account_id, &api_token);

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

    // TODO Matrix
}
