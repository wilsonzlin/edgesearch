use std::path::PathBuf;
use std::sync::Arc;

use actix_web::{App, HttpResponse, HttpServer, web};
use actix_web::middleware::Logger;
use actix_web::web::Bytes;

use crate::data::packed::PackedReader;
use actix_web::body::Body;

struct TestServer {
    default_results: Bytes,
    packed_documents: Vec<Bytes>,
    packed_popular_terms: Vec<Bytes>,
    packed_normal_terms: Vec<Bytes>,
}

async fn handle_get_default_results(config: web::Data<Arc<TestServer>>) -> HttpResponse {
    HttpResponse::Ok().body(Body::Bytes(config.default_results.slice(..)))
}

async fn handle_get_documents_package(config: web::Data<Arc<TestServer>>, path: web::Path<(usize, )>) -> HttpResponse {
    match config.packed_documents.get(path.0) {
        None => HttpResponse::NotFound().finish(),
        Some(package) => HttpResponse::Ok().body(Body::Bytes(package.slice(..))),
    }
}

async fn handle_get_popular_terms_package(config: web::Data<Arc<TestServer>>, path: web::Path<(usize, )>) -> HttpResponse {
    match config.packed_popular_terms.get(path.0) {
        None => HttpResponse::NotFound().finish(),
        Some(package) => HttpResponse::Ok().body(Body::Bytes(package.slice(..))),
    }
}

async fn handle_get_normal_terms_package(config: web::Data<Arc<TestServer>>, path: web::Path<(usize, )>) -> HttpResponse {
    match config.packed_normal_terms.get(path.0) {
        None => HttpResponse::NotFound().finish(),
        Some(package) => HttpResponse::Ok().body(Body::Bytes(package.slice(..))),
    }
}

#[actix_rt::main]
pub async fn start_server(output_dir: PathBuf, port: usize, default_results: String) -> () {
    std::env::set_var("RUST_LOG", "actix_web=debug");
    env_logger::init();

    println!("Reading packed documents packages...");
    let packed_documents = PackedReader::new(&output_dir, "documents")
        .map(|package_data| Bytes::copy_from_slice(&package_data))
        .collect::<Vec<Bytes>>();

    println!("Reading packed postings list entries for popular terms packages...");
    let packed_popular_terms = PackedReader::new(&output_dir, "popular_terms")
        .map(|package_data| Bytes::copy_from_slice(&package_data))
        .collect::<Vec<Bytes>>();

    println!("Reading packed postings list entries for normal terms packages...");
    let packed_normal_terms = PackedReader::new(&output_dir, "normal_terms")
        .map(|package_data| Bytes::copy_from_slice(&package_data))
        .collect::<Vec<Bytes>>();

    let config = Arc::new(TestServer {
        default_results: Bytes::copy_from_slice(default_results.as_bytes()),
        packed_documents,
        packed_popular_terms,
        packed_normal_terms,
    });

    println!("Starting server...");
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .data(config.clone())
            .route("/package/default", web::get().to(handle_get_default_results))
            .route("/package/doc/{doc_id}", web::get().to(handle_get_documents_package))
            .route("/package/popular_terms/{doc_id}", web::get().to(handle_get_popular_terms_package))
            .route("/package/normal_terms/{doc_id}", web::get().to(handle_get_normal_terms_package))
    })
        .bind(format!("127.0.0.1:{}", port).as_str()).expect("binding to port")
        .run().await.expect("run server");
}
