use std::collections::HashMap;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

pub const KV_MAX_BATCH_SIZE: usize = 10000;

#[derive(Serialize, Deserialize)]
struct KVEntry {
    key: String,
    value: String,
    base64: bool,
}

pub fn upload_kv_batch(
    client: &Client,
    batch: &HashMap<String, String>,
    account_id: &String,
    api_token: &String,
    kv_namespace: &String,
    base64: bool,
) -> () {
    if batch.is_empty() {
        return;
    };

    client
        .post(format!("https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{kv_namespace}/bulk",
            account_id = account_id,
            kv_namespace = kv_namespace,
        ).as_str())
        .bearer_auth(api_token)
        .json(&batch.iter().map(|(key, value)| KVEntry {
            key: key.to_string(),
            value: value.to_string(),
            base64,
        }).collect::<Vec<KVEntry>>())
        .send()
        .expect("upload KV values batch");
}
