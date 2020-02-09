use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use structopt::StructOpt;

use edgesearch::build::{build, BuildConfig, DocumentEncoding};
use edgesearch::deploy::{deploy, DeployConfig};
use edgesearch::test::start_server;

use crate::Cli::{Build, Deploy, Test};

#[derive(StructOpt)]
enum Cli {
    Build {
        #[structopt(long, parse(from_os_str))]
        default_results: PathBuf,
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
        #[structopt(long, default_value = "50")]
        maximum_query_terms: usize,
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
        account_email: String,
        #[structopt(long, parse(from_os_str))]
        documents: PathBuf,
        #[structopt(long)]
        global_api_key: String,
        #[structopt(long)]
        name: String,
        #[structopt(long)]
        namespace: Option<String>,
        #[structopt(long, parse(from_os_str))]
        output_dir: PathBuf,
        #[structopt(long)]
        upload_data: bool,
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
            default_results: default_results_path,
            document_encoding,
            document_terms,
            error,
            maximum_query_bytes,
            maximum_query_results,
            maximum_query_terms,
            name,
            output_dir,
            popular,
        } => {
            let mut default_results = String::new();
            File::open(default_results_path).expect("open default results file").read_to_string(&mut default_results).expect("read default results file");
            build(BuildConfig {
                default_results: &default_results,
                document_encoding,
                document_terms_source: File::open(document_terms).expect("open document terms file"),
                error,
                maximum_query_bytes,
                maximum_query_results,
                maximum_query_terms,
                name: &name,
                output_dir,
                popular,
            });
        }
        Deploy {
            account_id,
            account_email,
            documents,
            global_api_key,
            name,
            namespace,
            output_dir,
            upload_data,
        } => {
            deploy(DeployConfig {
                account_id,
                account_email,
                documents: File::open(documents).expect("open documents file"),
                global_api_key,
                name,
                namespace,
                output_dir,
                upload_data,
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
