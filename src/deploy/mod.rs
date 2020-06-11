use std::fs::{File, remove_file};
use std::path::PathBuf;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::data::chunks::ChunksReader;
use crate::deploy::cfreq::CFAuth;
use crate::deploy::kv::{create_namespace, upload_kv};
use crate::deploy::worker::publish_worker;

mod cfreq;
mod kv;
mod worker;

#[derive(Serialize, Deserialize)]
struct UploadState {
    next_documents_chunk: usize,
    next_terms_chunk: usize,
}

pub struct DeployConfig {
    pub account_email: String,
    pub account_id: String,
    pub global_api_key: String,
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
    account_email,
    account_id,
    global_api_key,
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
            next_documents_chunk: 0,
            next_terms_chunk: 0,
        });

        for (package_id, package) in ChunksReader::new(&output_dir, "documents").enumerate() {
            if package_id < upload_state.next_documents_chunk {
                continue;
            };
            println!("Uploading documents chunk {}...", package_id);
            upload_kv(&client, &auth, format!("doc_{}", package_id).as_str(), package, &kv_namespace);
            update_and_save_upload_state!(upload_state, next_documents_chunk, package_id + 1, upload_state_path);
        };

        for (package_id, package) in ChunksReader::new(&output_dir, "terms").enumerate() {
            if package_id < upload_state.next_terms_chunk {
                continue;
            };
            println!("Uploading terms chunk {}...", package_id);
            upload_kv(&client, &auth, format!("terms_{}", package_id).as_str(), package, &kv_namespace);
            update_and_save_upload_state!(upload_state, next_terms_chunk, package_id + 1, upload_state_path);
        };

        remove_file(&upload_state_path).expect("remove upload state file");
        println!("Data successfully uploaded");
    };
}
