use std::path::PathBuf;

pub struct DeployConfig {
    account_id: String,
    api_token: String,
    name: String,
    output_dir: PathBuf,
}

pub fn deploy(DeployConfig {
    account_id,
    api_token,
    name,
    output_dir,
}: DeployConfig) -> () {
    // TODO
}
