use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;

use reqwest::blocking::Client;

use crate::data::documents::DocumentsReader;
use crate::data::postings_list::PostingsListReader;
use crate::deploy::cfreq::CFAuth;
use crate::deploy::kv::{create_namespace, KV_MAX_BATCH_SIZE, upload_kv_batch};
use crate::deploy::worker::publish_worker;

mod cfreq;
mod kv;
mod worker;

pub struct DeployConfig {
    pub account_id: String,
    pub account_email: String,
    pub global_api_key: String,
    pub documents: File,
    pub name: String,
    pub namespace: Option<String>,
    pub output_dir: PathBuf,
    pub upload_data: bool,
}

pub fn deploy(DeployConfig {
    account_id,
    account_email,
    global_api_key,
    documents,
    name,
    namespace,
    output_dir,
    upload_data,
}: DeployConfig) -> () {
    let client = Client::new();
    let auth = CFAuth {
        account_id,
        account_email,
        global_api_key,
    };
    let kv_namespace = namespace.unwrap_or_else(|| create_namespace(&client, &auth, &format!("EDGESEARCH_{}", name)));

    publish_worker(&client, &auth, &output_dir, &name, &kv_namespace);

    if !upload_data {
        println!("Not uploading data");
    } else {
        let process_batch = |batch: &mut HashMap<String, String>, base64: bool| -> () {
            upload_kv_batch(&client, &auth, batch, &kv_namespace, base64);
            batch.clear();
        };

        println!("Uploading documents...");
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

        println!("Uploading postings list...");
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
    };
}
