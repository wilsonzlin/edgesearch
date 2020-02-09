use std::thread::sleep;
use std::time::Duration;

use reqwest::blocking::{Client, multipart, Response};
use reqwest::Method;
use serde::{Deserialize, Serialize};

pub struct CFAuth {
    pub account_id: String,
    // Some APIs (e.g. KV batch write) don't support bearer auth yet.
    pub account_email: String,
    pub global_api_key: String,
}

#[derive(Serialize, Deserialize)]
pub struct CFRequestError {
    code: usize,
    message: String,
}

pub fn make_json_request<B, R>(
    client: &Client,
    method: Method,
    auth: &CFAuth,
    path: String,
    body: &B,
) -> R where B: Serialize, for<'de> R: Deserialize<'de> {
    let mut retry_delay: u64 = 1;
    loop {
        let res = client
            .request(method.clone(), format!("https://api.cloudflare.com/client/v4/accounts/{account_id}{path}",
                account_id = auth.account_id,
                path = path,
            ).as_str())
            .header("X-Auth-Email", &auth.account_email)
            .header("X-Auth-Key", &auth.global_api_key)
            .json(body)
            .send();
        match res {
            Ok(res) => return handle_response(res),
            Err(err) => {
                println!("Request failed with error {}", err);
                println!("Retrying...");
                sleep(Duration::new(retry_delay, 0));
                retry_delay *= 2;
            }
        };
    };
}

pub fn make_form_request<R>(
    client: &Client,
    method: Method,
    auth: &CFAuth,
    path: String,
    body: multipart::Form,
) -> R where for<'de> R: Deserialize<'de> {
    let res = client
        .request(method, format!("https://api.cloudflare.com/client/v4/accounts/{account_id}{path}",
            account_id = auth.account_id,
            path = path,
        ).as_str())
        .header("X-Auth-Email", &auth.account_email)
        .header("X-Auth-Key", &auth.global_api_key)
        .multipart(body)
        .send()
        .expect("API call");
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
