use reqwest::blocking::Client;
use reqwest::Method;
use serde::{Deserialize, Serialize};

use crate::deploy::cfreq::{Body, CFAuth, CFRequestError, make_request};

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
    let data: CreateNamespaceResponse = make_request(
        client,
        Method::POST,
        auth,
        "/storage/kv/namespaces".to_string(),
        Body::json(&CreateNamespaceRequest {
            title: kv_namespace.clone(),
        }),
    );
    let ns_id = data.result.id;
    println!("KV namespace created: {}", ns_id);
    println!("Pass this as an argument to future deploy commands");
    return ns_id;
}

#[derive(Serialize, Deserialize)]
struct KVEntry {
    key: String,
    value: String,
    base64: bool,
}

#[derive(Serialize, Deserialize)]
struct KVUploadResponse {
    success: bool,
    errors: Vec<CFRequestError>,
    messages: Vec<String>,
}

pub fn upload_kv(
    client: &Client,
    auth: &CFAuth,
    key: &str,
    value: Vec<u8>,
    kv_namespace: &String,
) -> () {
    let _: KVUploadResponse = make_request(
        client,
        Method::PUT,
        auth,
        format!("/storage/kv/namespaces/{}/values/{}", kv_namespace, key),
        Body::Bytes(value),
    );
}
