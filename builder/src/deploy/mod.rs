use std::collections::HashMap;
use std::fs::{File, remove_file};
use std::path::PathBuf;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::data::documents::DocumentsReader;
use crate::data::postings_list::PostingsListReader;
use crate::deploy::cfreq::CFAuth;
use crate::deploy::kv::{create_namespace, KV_MAX_BATCH_SIZE, upload_kv_batch};
use crate::deploy::worker::publish_worker;

mod cfreq;
mod kv;
mod worker;

#[derive(Serialize, Deserialize)]
struct UploadState {
    next_document_id: usize,
    next_postings_list_entry: usize,
}

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

macro_rules! update_and_save_upload_state {
    ($state:ident, $state_field:ident, $new_val:expr, $file_path:ident) => {
        $state.$state_field = $new_val;
        let upload_state_file = File::create(&$file_path).expect("open upload state file for writing");
        serde_json::to_writer(&upload_state_file, &$state).expect("save upload state to file");
    };
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
        let upload_state_path = output_dir.join("upload-state.tmp");
        let mut upload_state = File::open(&upload_state_path).ok().and_then(|f| serde_json::from_reader(f).ok()).unwrap_or(UploadState {
            next_document_id: 0,
            next_postings_list_entry: 0,
        });
        let process_batch = |batch: &mut HashMap<String, String>, base64: bool| -> () {
            upload_kv_batch(&client, &auth, batch, &kv_namespace, base64);
            batch.clear();
        };

        println!("Uploading documents...");
        let mut documents_batch = HashMap::<String, String>::new();
        let mut next_document_id = 0;
        for (document_id, document) in DocumentsReader::new(documents) {
            if document_id < upload_state.next_document_id {
                continue;
            };
            documents_batch.insert(
                format!("doc_{}", document_id),
                document,
            );
            next_document_id = document_id + 1;

            if documents_batch.len() == KV_MAX_BATCH_SIZE {
                println!("Uploading documents up to {}...", document_id);
                process_batch(&mut documents_batch, false);
                update_and_save_upload_state!(upload_state, next_document_id, next_document_id, upload_state_path);
            };
        };
        process_batch(&mut documents_batch, false);
        update_and_save_upload_state!(upload_state, next_document_id, next_document_id, upload_state_path);

        println!("Uploading postings list...");
        let mut postings_list_entries_batch = HashMap::<String, String>::new();
        let mut next_entry_no = 0;
        for (entry_no, (term, bitmap)) in PostingsListReader::new(&output_dir).enumerate() {
            if entry_no < upload_state.next_postings_list_entry {
                continue;
            };
            postings_list_entries_batch.insert(
                format!("postingslist_{}", term),
                base64::encode(&bitmap),
            );
            next_entry_no = entry_no;

            if postings_list_entries_batch.len() == KV_MAX_BATCH_SIZE {
                println!("Uploading postings list entries up to {}...", entry_no);
                process_batch(&mut postings_list_entries_batch, true);
                update_and_save_upload_state!(upload_state, next_postings_list_entry, next_entry_no, upload_state_path);
            };
        };
        process_batch(&mut postings_list_entries_batch, true);
        update_and_save_upload_state!(upload_state, next_postings_list_entry, next_entry_no, upload_state_path);

        // TODO Matrix

        remove_file(&upload_state_path).expect("remove upload state file");
    };
}
