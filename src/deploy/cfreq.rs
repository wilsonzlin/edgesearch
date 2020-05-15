use reqwest::blocking::{Client, multipart, Response};
use reqwest::Method;
use serde::{Deserialize, Serialize};

pub struct CFAuth {
    pub account_id: String,
    // Some APIs (e.g. KV batch write) don't support bearer auth yet.
    pub account_email: String,
    pub global_api_key: String,
}

pub enum Body {
    Bytes(Vec<u8>),
    Multipart(multipart::Form),
}

impl Body {
    pub fn json<B: Serialize>(o: B) -> Body {
        Body::Bytes(serde_json::to_vec(&o).unwrap())
    }
}

#[derive(Serialize, Deserialize)]
pub struct CFRequestError {
    code: usize,
    message: String,
}

pub fn make_request<R>(
    client: &Client,
    method: Method,
    auth: &CFAuth,
    path: String,
    body: Body,
) -> R where for<'de> R: Deserialize<'de> {
    let mut req = client
        .request(method, format!("https://api.cloudflare.com/client/v4/accounts/{account_id}{path}",
            account_id = auth.account_id,
            path = path,
        ).as_str())
        .header("X-Auth-Email", &auth.account_email)
        .header("X-Auth-Key", &auth.global_api_key);
    match body {
        Body::Bytes(b) => req = req.body(b),
        Body::Multipart(m) => req = req.multipart(m),
    };
    let res = req.send().expect("send API request");
    handle_response(res)
}

fn handle_response<R>(
    res: Response,
) -> R where for<'de> R: Deserialize<'de> {
    let status = res.status();
    let url = res.url().to_string();
    let text = res.text().unwrap_or("".to_string());
    if !status.is_success() {
        panic!("Request to {} failed with status {}: {}", url, status, text);
    };
    serde_json::from_str(text.as_str()).expect("parse API response as JSON")
}
