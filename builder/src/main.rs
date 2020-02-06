use std::fs::File;

use structopt::StructOpt;

use edgesearch::{build, BuildConfig, DocumentEncoding};

#[derive(StructOpt)]
struct Cli {
    #[structopt(long, default_value = "text")]
    document_encoding: DocumentEncoding,
    #[structopt(long, parse(from_os_str))]
    document_terms: std::path::PathBuf,
    #[structopt(long)]
    error: f64,
    #[structopt(long, default_value = "512")]
    maximum_query_bytes: usize,
    #[structopt(long)]
    maximum_query_results: usize,
    #[structopt(long)]
    name: String,
    #[structopt(long, parse(from_os_str))]
    output_dir: std::path::PathBuf,
    #[structopt(long)]
    popular: f64,
}

fn main() {
    let args = Cli::from_args();
    build(BuildConfig {
        document_encoding: args.document_encoding,
        document_terms_source: File::open(args.document_terms).expect("open document terms file"),
        error: args.error,
        maximum_query_bytes: args.maximum_query_bytes,
        maximum_query_results: args.maximum_query_results,
        name: args.name,
        output_dir: args.output_dir,
        popular: args.popular,
    })
}
