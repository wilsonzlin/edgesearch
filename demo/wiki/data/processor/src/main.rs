use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use lazy_static::lazy_static;
use parquet::file::reader::{FileReader, SerializedFileReader};
use parquet::record::RowAccessor;
use regex::Regex;
use structopt::StructOpt;

// Use this program with monthly article page views data from https://dumps.wikimedia.org/other/pageview_complete/.

#[derive(StructOpt)]
struct Cli {
    #[structopt(long, parse(from_os_str))]
    data_file: PathBuf,
    #[structopt(long, parse(from_os_str))]
    out_dir: PathBuf,
}

lazy_static! {
    static ref PAGE_ID_REGEX: Regex = Regex::new(r"^(?:[0-9]+|null)").unwrap();
    static ref TERMS_REGEX: Regex = Regex::new(r"[a-zA-Z0-9]+").unwrap();
}

const LINE_PREFIX: &'static str = "en.wikipedia";


fn main() {
    let Cli {
        data_file,
        out_dir,
    } = Cli::from_args();

    let mut titles = HashMap::<String, usize>::new();
    let reader = SerializedFileReader::new(File::open(data_file).expect("open data file")).expect("read data file");

    for r in reader.get_row_iter(None).expect("get row iterator") {
        let line = r.get_string(0).expect("get single string column");
        let mut parts = line.split(' ');
        if parts.next().expect("row has no wiki code") != LINE_PREFIX {
            continue;
        };
        let title = parts.next().expect("row has no title");
        parts.next().filter(|id| PAGE_ID_REGEX.is_match(id)).expect("row has no page ID");
        parts.next().expect("row has no device type");
        let count = parts.next().and_then(|c| c.parse::<usize>().ok()).expect("row has no count");
        parts.next().expect("row has no hourly metrics");
        if parts.next().is_some() { panic!("row has extraneous components"); };
        *titles.entry(title.to_string()).or_insert(0) += count;
    };
    println!("Read complete");

    let mut sorted = titles.into_iter().collect::<Vec<_>>();
    sorted.sort_by_key(|(_, count)| *count);
    sorted.reverse();
    println!("Sort complete");

    let mut out_docs = Vec::<u8>::new();
    let mut out_terms = Vec::<u8>::new();

    for (title, _) in sorted {
        let terms = TERMS_REGEX.captures_iter(&title).into_iter().map(|m| m[0].to_lowercase()).collect::<Vec<String>>();
        if terms.is_empty() {
            continue;
        };
        serde_json::to_writer(&mut out_docs, &title).expect("write docs.txt");
        out_docs.push(b'\0');
        for term in terms {
            out_terms.append(&mut term.into_bytes());
            out_terms.push(b'\0');
        };
        out_terms.push(b'\0');
    };
    File::create(out_dir.join("docs.txt"))
        .expect("open docs.txt output file")
        .write_all(&out_docs)
        .expect("write docs.txt");
    File::create(out_dir.join("terms.txt"))
        .expect("open terms.txt output file")
        .write_all(&out_terms)
        .expect("write terms.txt");
    println!("Write complete");
}
