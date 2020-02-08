use std::fs::File;
use std::path::PathBuf;

use structopt::StructOpt;

use edgesearch::build::{build, BuildConfig, DocumentEncoding};
use edgesearch::test::start_server;

use crate::Cli::{Build, Test, Deploy};
use edgesearch::deploy::{DeployConfig, deploy};

#[derive(StructOpt)]
enum Cli {
    Build {
        #[structopt(long, default_value = "text")]
        document_encoding: DocumentEncoding,
        #[structopt(long, parse(from_os_str))]
        document_terms: PathBuf,
        #[structopt(long)]
        error: f64,
        #[structopt(long, default_value = "512")]
        maximum_query_bytes: usize,
        #[structopt(long)]
        maximum_query_results: usize,
        #[structopt(long)]
        name: String,
        #[structopt(long, parse(from_os_str))]
        output_dir: PathBuf,
        #[structopt(long)]
        popular: f64,
    },
    Deploy {
        #[structopt(long)]
        account_id: String,
        #[structopt(long)]
        api_token: String,
        #[structopt(long, parse(from_os_str))]
        documents: PathBuf,
        #[structopt(long)]
        name: String,
        #[structopt(long, parse(from_os_str))]
        output_dir: PathBuf,
    },
    Test {
        #[structopt(long, default_value = "text")]
        document_encoding: DocumentEncoding,
        #[structopt(long, parse(from_os_str))]
        documents: PathBuf,
        #[structopt(long)]
        maximum_query_results: usize,
        #[structopt(long, parse(from_os_str))]
        output_dir: PathBuf,
        #[structopt(long)]
        port: usize,
    },
}

fn main() {
    let args = Cli::from_args();

    match args {
        Build {
            document_encoding,
            document_terms,
            error,
            maximum_query_bytes,
            maximum_query_results,
            name,
            output_dir,
            popular,
        } => {
            build(BuildConfig {
                document_encoding,
                document_terms_source: File::open(document_terms).expect("open document terms file"),
                error,
                maximum_query_bytes,
                maximum_query_results,
                name,
                output_dir,
                popular,
            });
        }
        Deploy {
            account_id,
            api_token,
            documents,
            name,
            output_dir,
        } => {
            deploy(DeployConfig {
                account_id,
                api_token,
                documents: File::open(documents).expect("open documents file"),
                name,
                output_dir,
            });
        }
        Test {
            document_encoding,
            documents,
            maximum_query_results,
            output_dir,
            port,
        } => {
            start_server(File::open(documents).expect("open documents file"), output_dir, port, maximum_query_results);
        }
    };
}
