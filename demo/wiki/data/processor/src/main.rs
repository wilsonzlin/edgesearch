use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use structopt::StructOpt;

// Use this program with monthly article page views data from https://dumps.wikimedia.org/other/pagecounts-ez/.

#[derive(StructOpt)]
struct Cli {
    #[structopt(long, parse(from_os_str))]
    data_file: PathBuf,
    #[structopt(long, parse(from_os_str))]
    out_dir: PathBuf,
}

lazy_static! {
    static ref LINE_REGEX: Regex = Regex::new(r"^en\.(?:m\.)?z (?P<title>[^ ]+) (?P<count>[0-9]+)$").unwrap();
    static ref TERMS_REGEX: Regex = Regex::new(r"[a-zA-Z0-9]+").unwrap();
}


fn main() {
    let Cli {
        data_file,
        out_dir,
    } = Cli::from_args();

    let mut titles = HashMap::<String, usize>::new();
    let reader = BufReader::new(File::open(data_file).expect("read data file"));

    for line in reader.lines() {
        let line = line.expect("read data file line");
        let matches = match LINE_REGEX.captures(&line) {
            Some(matches) => matches,
            None => continue,
        };
        let title = &matches["title"];
        let count = &matches["count"];
        *titles.entry(title.to_string()).or_insert(0) += str::parse::<usize>(count).unwrap();
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
