use std::path::PathBuf;
use std::sync::Arc;

use actix_web::{App, HttpResponse, HttpServer, web};
use actix_web::body::Body;
use actix_web::middleware::Logger;
use actix_web::web::Bytes;

use crate::data::packed::ChunksReader;

struct TestServer {
    default_results: Bytes,
    documents: Vec<Bytes>,
    popular_terms: Vec<Bytes>,
    normal_terms: Vec<Bytes>,
}

async fn handle_get_default_results(config: web::Data<Arc<TestServer>>) -> HttpResponse {
    HttpResponse::Ok().body(Body::Bytes(config.default_results.slice(..)))
}

async fn handle_get_documents_package(config: web::Data<Arc<TestServer>>, path: web::Path<(usize, )>) -> HttpResponse {
    match config.documents.get(path.0) {
        None => HttpResponse::NotFound().finish(),
        Some(chunk) => HttpResponse::Ok().body(Body::Bytes(chunk.slice(..))),
    }
}

async fn handle_get_popular_terms_package(config: web::Data<Arc<TestServer>>, path: web::Path<(usize, )>) -> HttpResponse {
    match config.popular_terms.get(path.0) {
        None => HttpResponse::NotFound().finish(),
        Some(chunk) => HttpResponse::Ok().body(Body::Bytes(chunk.slice(..))),
    }
}

async fn handle_get_normal_terms_package(config: web::Data<Arc<TestServer>>, path: web::Path<(usize, )>) -> HttpResponse {
    match config.normal_terms.get(path.0) {
        None => HttpResponse::NotFound().finish(),
        Some(chunk) => HttpResponse::Ok().body(Body::Bytes(chunk.slice(..))),
    }
}

#[actix_rt::main]
pub async fn start_server(output_dir: PathBuf, port: usize, default_results: String) -> () {
    std::env::set_var("RUST_LOG", "actix_web=debug");
    env_logger::init();

    println!("Reading documents...");
    let documents = ChunksReader::new(&output_dir, "documents")
        .map(|chunk| Bytes::copy_from_slice(&chunk))
        .collect::<Vec<Bytes>>();

    println!("Reading popular terms...");
    let popular_terms = ChunksReader::new(&output_dir, "popular_terms")
        .map(|chunk| Bytes::copy_from_slice(&chunk))
        .collect::<Vec<Bytes>>();

    println!("Reading normal terms...");
    let normal_terms = ChunksReader::new(&output_dir, "normal_terms")
        .map(|chunk| Bytes::copy_from_slice(&chunk))
        .collect::<Vec<Bytes>>();

    let config = Arc::new(TestServer {
        default_results: Bytes::copy_from_slice(default_results.as_bytes()),
        documents,
        popular_terms,
        normal_terms,
    });

    println!("Starting server...");
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .data(config.clone())
            .route("/default", web::get().to(handle_get_default_results))
            .route("/doc/{id}", web::get().to(handle_get_documents_package))
            .route("/popular_terms/{id}", web::get().to(handle_get_popular_terms_package))
            .route("/normal_terms/{id}", web::get().to(handle_get_normal_terms_package))
    })
        .bind(format!("127.0.0.1:{}", port).as_str()).expect("binding to port")
        .run().await.expect("run server");
}
