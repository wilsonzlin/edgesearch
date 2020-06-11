use std::fs::File;
use std::path::PathBuf;

use structopt::StructOpt;

use edgesearch::build::{build, BuildConfig};
use edgesearch::deploy::{deploy, DeployConfig};

use crate::Cli::{Build, Deploy};

#[derive(StructOpt)]
enum Cli {
    Build {
        #[structopt(long, parse(from_os_str))] document_terms: PathBuf,
        #[structopt(long, parse(from_os_str))] documents: PathBuf,
        #[structopt(long, default_value = "50")] maximum_query_results: usize,
        #[structopt(long, default_value = "50")] maximum_query_terms: usize,
        #[structopt(long, parse(from_os_str))] output_dir: PathBuf,
    },
    Deploy {
        #[structopt(long)] account_email: String,
        #[structopt(long)] account_id: String,
        #[structopt(long)] global_api_key: String,
        #[structopt(long)] name: String,
        #[structopt(long)] namespace: Option<String>,
        #[structopt(long, parse(from_os_str))] output_dir: PathBuf,
        #[structopt(long)] upload_data: bool,
    },
}

fn main() {
    let args = Cli::from_args();

    match args {
        Build {
            document_terms,
            documents,
            maximum_query_results,
            maximum_query_terms,
            output_dir,
        } => {
            build(BuildConfig {
                document_terms_source: File::open(document_terms).expect("open document terms file"),
                documents_source: File::open(documents).expect("open documents file"),
                maximum_query_results,
                maximum_query_terms,
                output_dir,
            });
        }
        Deploy {
            account_email,
            account_id,
            global_api_key,
            name,
            namespace,
            output_dir,
            upload_data,
        } => {
            deploy(DeployConfig {
                account_email,
                account_id,
                global_api_key,
                name,
                namespace,
                output_dir,
                upload_data,
            });
        }
    };
}
