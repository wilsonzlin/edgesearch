use std::collections::HashMap;

use reqwest::blocking::Client;
use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::deploy::cfreq::{CFAuth, CFRequestError, make_json_request};

#[derive(Serialize, Deserialize)]
struct CreateNamespaceRequest {
    title: String,
}

#[derive(Serialize, Deserialize)]
struct CreateNamespaceResult {
    id: String,
    title: String,
    supports_url_encoding: bool,
}

#[derive(Serialize, Deserialize)]
struct CreateNamespaceResponse {
    success: bool,
    errors: Vec<CFRequestError>,
    messages: Vec<String>,
    result: CreateNamespaceResult,
}

pub fn create_namespace(
    client: &Client,
    auth: &CFAuth,
    kv_namespace: &String,
) -> String {
    println!("No KV namespace ID was provided, creating one now...");
    let data: CreateNamespaceResponse = make_json_request(
        client,
        Method::POST,
        auth,
        "/storage/kv/namespaces".to_string(),
        &CreateNamespaceRequest {
            title: kv_namespace.clone(),
        },
    );
    let ns_id = data.result.id;
    println!("KV namespace created: {}", ns_id);
    println!("Pass this as an argument to future deploy commands");
    return ns_id;
}

pub const KV_MAX_BATCH_SIZE: usize = 10000;

#[derive(Serialize, Deserialize)]
struct KVEntry {
    key: String,
    value: String,
    base64: bool,
}

#[derive(Serialize, Deserialize)]
struct KVBatchUploadResponse {
    success: bool,
    errors: Vec<CFRequestError>,
    messages: Vec<String>,
}

pub fn upload_kv_batch(
    client: &Client,
    auth: &CFAuth,
    batch: &HashMap<String, String>,
    kv_namespace: &String,
    base64: bool,
) -> () {
    if batch.is_empty() {
        return;
    };

    let _: KVBatchUploadResponse = make_json_request(
        client,
        Method::PUT,
        auth,
        format!("/storage/kv/namespaces/{}/bulk", kv_namespace),
        &batch.iter().map(|(key, value)| KVEntry {
            key: key.to_string(),
            value: value.to_string(),
            base64,
        }).collect::<Vec<KVEntry>>(),
    );
}
