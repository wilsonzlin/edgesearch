use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;
use std::sync::Arc;

use actix_web::{App, HttpResponse, HttpServer, web};
use actix_web::middleware::Logger;
use croaring::Bitmap;
use serde::{Deserialize, Serialize};

use crate::data::documents::DocumentsReader;
use crate::data::postings_list::PostingsListReader;
use crate::DocumentId;

#[derive(Serialize, Deserialize)]
struct QueryRequest {
    require: Vec<String>,
    contain: Vec<String>,
    exclude: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct QueryResponse {
    documents: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ErrorResponse {
    message: String,
}

struct BitmapResult {
    result: Option<Bitmap>,
}

impl BitmapResult {
    fn new() -> BitmapResult {
        BitmapResult {
            result: None,
        }
    }

    fn and(&mut self, other: &Bitmap) -> () {
        match self.result.as_mut() {
            None => self.result = Some(other.clone()),
            Some(result) => result.and_inplace(other),
        };
    }

    fn or(&mut self, other: &Bitmap) -> () {
        match self.result.as_mut() {
            None => self.result = Some(other.clone()),
            Some(result) => result.or_inplace(other),
        };
    }

    fn values(&self, limit: usize) -> Vec<u32> {
        match &self.result {
            None => Vec::new(),
            Some(bitmap) => bitmap.iter().take(limit).collect(),
        }
    }
}

struct TestServer {
    documents: Vec<String>,
    postings_list: HashMap<String, Bitmap>,
    max_results: usize,
}

async fn handle_query(config: web::Data<Arc<TestServer>>, query: web::Json<QueryRequest>) -> HttpResponse {
    let mut result = BitmapResult::new();

    for req_term in query.require.iter() {
        match config.postings_list.get(req_term) {
            None => continue,
            Some(bitmap) => result.and(bitmap),
        };
    };

    if !query.contain.is_empty() {
        result.and(&Bitmap::fast_or(
            &query.contain
                .iter()
                .map(|term| config.postings_list.get(term))
                .filter(|b| b.is_some())
                .map(|b| b.unwrap())
                .collect::<Vec<&Bitmap>>()
        ));
    };

    // TODO Not

    HttpResponse::Ok().json(QueryResponse {
        documents: result
            .values(config.max_results)
            .iter()
            .map(|&document_id| config.documents.get(document_id as usize).unwrap().clone())
            .collect(),
    })
}

#[actix_rt::main]
pub async fn start_server(documents: File, output_dir: PathBuf, port: usize, max_results: usize) -> () {
    std::env::set_var("RUST_LOG", "actix_web=debug");
    env_logger::init();

    println!("Reading documents...");
    let documents = DocumentsReader::new(documents).map(|(_, doc)| doc).collect();

    println!("Reading postings list...");
    let postings_list = PostingsListReader::new(&output_dir).map(|(term, serialised)| (term, Bitmap::deserialize(&serialised))).collect();

    let config = Arc::new(TestServer {
        documents,
        postings_list,
        max_results,
    });

    println!("Starting server...");
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .data(config.clone())
            .route("/search", web::post().to(handle_query))
    })
        .bind(format!("127.0.0.1:{}", port).as_str()).expect("binding to port")
        .run().await.expect("run server");
}
