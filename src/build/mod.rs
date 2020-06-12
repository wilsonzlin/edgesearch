use std::collections::HashMap;
use std::convert::TryInto;
use std::fs::{create_dir, File, remove_dir_all};
use std::io::Write;
use std::path::PathBuf;

use croaring::Bitmap;

use crate::{Term, TermId};
use crate::build::chunks::{ChunkStrKey, ChunkU32Key};
use crate::build::chunks::bst::BstChunks;
use crate::build::js::generate_worker_js;
use crate::build::wasm::generate_and_compile_runner_wasm;
use crate::data::document_terms::DocumentTermsReader;
use crate::data::documents::DocumentsReader;
use crate::util::format::{number, percent};
use crate::util::log::status_log_interval;

mod js;
mod chunks;
mod wasm;

// 10 MiB.
const KV_VALUE_MAX_SIZE: usize = 10 * 1024 * 1024;

pub struct BuildConfig {
    pub document_terms_source: File,
    pub documents_source: File,
    pub maximum_query_results: usize,
    pub maximum_query_terms: usize,
    pub output_dir: PathBuf,
}

pub fn build(BuildConfig {
    document_terms_source,
    documents_source,
    maximum_query_results,
    maximum_query_terms,
    output_dir,
}: BuildConfig) -> () {
    // term_id => term.
    let mut terms = Vec::<Term>::new();
    // term => term_id.
    let mut term_ids = HashMap::<Term, TermId>::new();
    // document_id => term_id[].
    let mut terms_by_document = Vec::<Vec<TermId>>::new();
    // term_id => bitmap.
    let mut inverted_index = Vec::<Bitmap>::new();
    // term_id => document_terms.filter(|d| d.contains(term_id)).count().
    let mut term_frequency = HashMap::<TermId, usize>::new();

    // - Each document must end with '\0', even if last.
    // - Each term must be unique within its document.
    // - Each term must end with '\0', even if last for document or entire index.
    // - Each term must not be empty.
    // - Each term must not contain '\0'.
    for (document_id, term) in DocumentTermsReader::new(document_terms_source) {
        // Some documents have no terms, so iteration could skip a few document IDs.
        while terms_by_document.len() <= document_id {
            terms_by_document.push(Vec::<TermId>::new());
        };
        let document_terms = &mut terms_by_document[document_id];
        let term_id = match term_ids.get(&term) {
            Some(term_id) => *term_id,
            None => {
                assert_eq!(terms.len(), inverted_index.len());
                let term_id = terms.len() as TermId;
                term_ids.insert(term.clone(), term_id);
                terms.push(term);
                inverted_index.push(Bitmap::create());
                term_id
            }
        };

        document_terms.push(term_id);
        term_frequency.insert(term_id, term_frequency.get(&term_id).unwrap_or(&0) + 1);
    };

    let document_count = terms_by_document.len();

    let hash_log_interval = status_log_interval(document_count, 10);
    for (document_id, doc_terms) in terms_by_document.iter().enumerate() {
        interval_log!(hash_log_interval, document_id, document_count, "Processing documents ({})...");
        for term_id in doc_terms {
            // Add to the relevant postings list entry bitmap.
            inverted_index[*term_id].add(document_id.try_into().expect("too many documents"));
        };
    };

    println!("There are {} documents with {} terms", number(terms_by_document.len()), number(terms.len()));

    let mut terms_index_builder = BstChunks::<ChunkStrKey>::new(KV_VALUE_MAX_SIZE);
    let mut terms_sorted = (0..terms.len()).collect::<Vec<TermId>>();
    terms_sorted.sort_by(|a, b| terms[*a].cmp(&terms[*b]));
    for term_id in terms_sorted.iter() {
        let postings_list_entry = &mut inverted_index[*term_id];
        postings_list_entry.run_optimize();
        let serialised = postings_list_entry.serialize();
        terms_index_builder.insert(ChunkStrKey::new(&terms[*term_id]), serialised);
    };
    let (terms_index_raw_lookup, terms_index_serialised_entries) = terms_index_builder.serialise();
    println!("{} chunks contain terms", number(terms_index_builder.chunk_count()));
    let _ = remove_dir_all(output_dir.join("terms"));
    create_dir(output_dir.join("terms")).expect("create terms chunks folder");
    for (i, chunk) in terms_index_serialised_entries.iter().enumerate() {
        let mut f = File::create(
            output_dir.join("terms").join(format!("{}", i))
        ).expect("open terms chunk file for writing");
        f.write_all(chunk).expect("write terms chunk");
    };

    let mut documents_builder = BstChunks::<ChunkU32Key>::new(KV_VALUE_MAX_SIZE);
    for (document_id, document) in DocumentsReader::new(documents_source) {
        documents_builder.insert(ChunkU32Key::new(document_id.try_into().expect("too many documents")), document.as_bytes().to_vec());
    };
    let (documents_raw_lookup, documents_serialised_entries) = documents_builder.serialise();
    println!("{} chunks contain documents", number(documents_builder.chunk_count()));
    let _ = remove_dir_all(output_dir.join("documents"));
    create_dir(output_dir.join("documents")).expect("create documents chunks folder");
    for (i, chunk) in documents_serialised_entries.iter().enumerate() {
        let mut f = File::create(
            output_dir.join("documents").join(format!("{}", i))
        ).expect("open documents chunk file for writing");
        f.write_all(chunk).expect("write documents chunk");
    };

    generate_worker_js(
        &output_dir,
        terms_by_document.len(),
        maximum_query_terms,
        maximum_query_results,
    );
    generate_and_compile_runner_wasm(
        &output_dir,
        maximum_query_results,
        maximum_query_terms,
        terms_index_raw_lookup.as_str(),
        terms_index_serialised_entries.len(),
        documents_raw_lookup.as_str(),
        documents_serialised_entries.len(),
    );
    println!("Build complete")
}
