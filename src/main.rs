use std::fs::File;
use std::path::PathBuf;

use structopt::StructOpt;

use edgesearch::build::{build, BuildConfig, DataStore};

#[derive(StructOpt)]
struct Cli {
    #[structopt(long, default_value = "10485760")] chunk_size: usize,
    #[structopt(long, possible_values = &DataStore::variants(), case_insensitive = true)] data_store: DataStore,
    #[structopt(long)] data_store_url_prefix: Option<String>,
    #[structopt(long, parse(from_os_str))] document_terms: PathBuf,
    #[structopt(long, parse(from_os_str))] documents: PathBuf,
    #[structopt(long, default_value = "50")] maximum_query_results: usize,
    #[structopt(long, default_value = "50")] maximum_query_terms: usize,
    #[structopt(long, parse(from_os_str))] output_dir: PathBuf,
}

fn main() {
    let Cli {
        chunk_size,
        data_store,
        data_store_url_prefix,
        document_terms,
        documents,
        maximum_query_results,
        maximum_query_terms,
        output_dir,
    } = Cli::from_args();

    build(BuildConfig {
        chunk_size,
        data_store,
        data_store_url_prefix,
        document_terms_source: File::open(document_terms).expect("open document terms file"),
        documents_source: File::open(documents).expect("open documents file"),
        maximum_query_results,
        maximum_query_terms,
        output_dir,
    });
}
