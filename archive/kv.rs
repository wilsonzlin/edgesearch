pub const KV_MAX_BATCH_SIZE: usize = 10000;

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

    let _: KVBatchUploadResponse = make_request(
        client,
        Method::PUT,
        auth,
        format!("/storage/kv/namespaces/{}/bulk", kv_namespace),
        Body::json(&batch.iter().map(|(key, value)| KVEntry {
            key: key.to_string(),
            value: value.to_string(),
            base64,
        }).collect::<Vec<KVEntry>>()),
    );
}
