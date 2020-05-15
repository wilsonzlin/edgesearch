use std::collections::{HashMap, HashSet};
use std::convert::TryInto;
use std::fs::File;
use std::path::PathBuf;

use croaring::Bitmap;

use crate::{Term, TermId};
use crate::build::js::generate_worker_js;
use crate::build::chunks::{ChunkStrKey, ChunkU32Key};
use crate::build::chunks::bst::PackedEntriesWithBSTLookup;
use crate::build::chunks::direct::ChunksWithDirectLookup;
use crate::build::wasm::generate_and_compile_runner_wasm;
use crate::data::document_terms::DocumentTermsReader;
pub use crate::data::documents::DocumentEncoding;
use crate::data::documents::DocumentsReader;
use crate::data::packed::write_packed;
use crate::util::format::{frac_perc, number, percent};
use crate::util::log::status_log_interval;

mod js;
mod chunks;
mod wasm;

// 10 MiB.
const KV_VALUE_MAX_SIZE: usize = 10 * 1024 * 1024;
// 1 MiB.
const POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_MAX_SIZE: usize = 1 * 1024 * 1024;

pub struct BuildConfig {
    pub document_encoding: DocumentEncoding,
    pub document_terms_source: File,
    pub documents_source: File,
    pub maximum_query_bytes: usize,
    pub maximum_query_results: usize,
    pub maximum_query_terms: usize,
    pub output_dir: PathBuf,
}

pub fn build(BuildConfig {
    document_encoding,
    document_terms_source,
    documents_source,
    maximum_query_bytes,
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
    let term_count = term_frequency.len();
    assert!(term_count >= 1000);

    let hash_log_interval = status_log_interval(document_count, 10);
    for (document_id, doc_terms) in terms_by_document.iter().enumerate() {
        interval_log!(hash_log_interval, document_id, document_count, "Processing documents ({})...");
        for term_id in doc_terms {
            // Add to the relevant postings list entry bitmap.
            inverted_index[*term_id].add(document_id.try_into().expect("too many documents"));
        };
    };

    println!("There are {} documents with {} terms", number(terms_by_document.len()), number(terms.len()));

    let mut highest_frequency_terms = (0..terms.len()).collect::<Vec<TermId>>();
    // Sort by term if frequency is identical for deterministic orderings.
    highest_frequency_terms.sort_by(|a, b| term_frequency[b].cmp(&term_frequency[a]).then(terms[*b].cmp(&terms[*a])));

    let mut popular_terms = HashSet::<TermId>::new();
    let mut popular_terms_index = ChunksWithDirectLookup::new(KV_VALUE_MAX_SIZE, POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_MAX_SIZE);
    for term_id in highest_frequency_terms.iter() {
        let postings_list_entry = &mut inverted_index[*term_id];
        postings_list_entry.run_optimize();
        let serialised = postings_list_entry.serialize();
        if !popular_terms_index.insert(&ChunkStrKey::new(&terms[*term_id]), &serialised) {
            break;
        };
        popular_terms.insert(*term_id);
    };
    println!("{} chunks contain {} popular terms ({} of all terms)", number(popular_terms_index.get_chunks().len()), number(popular_terms.len()), frac_perc(popular_terms.len(), terms.len()));
    write_packed(&output_dir, "popular_terms", &popular_terms_index.get_chunks());

    let mut normal_terms_index_builder = PackedEntriesWithBSTLookup::<ChunkStrKey>::new(KV_VALUE_MAX_SIZE);
    let mut terms_sorted = (0..terms.len()).collect::<Vec<TermId>>();
    terms_sorted.sort_by(|a, b| terms[*a].cmp(&terms[*b]));
    for term_id in terms_sorted.iter() {
        if popular_terms.contains(term_id) { continue; };
        let postings_list_entry = &mut inverted_index[*term_id];
        postings_list_entry.run_optimize();
        let serialised = postings_list_entry.serialize();
        normal_terms_index_builder.insert(ChunkStrKey::new(&terms[*term_id]), serialised);
    };
    let (normal_terms_index_raw_lookup, normal_terms_index_serialised_entries) = normal_terms_index_builder.serialise();
    println!("{} chunks contain normal terms", number(normal_terms_index_builder.package_count()));
    write_packed(&output_dir, "normal_terms", &normal_terms_index_serialised_entries);

    let mut documents_builder = PackedEntriesWithBSTLookup::<ChunkU32Key>::new(KV_VALUE_MAX_SIZE);
    for (document_id, document) in DocumentsReader::new(documents_source) {
        documents_builder.insert(ChunkU32Key::new(document_id.try_into().expect("too many documents")), document.as_bytes().to_vec());
    };
    let (documents_raw_lookup, documents_serialised_entries) = documents_builder.serialise();
    println!("{} chunks contain documents", number(documents_builder.package_count()));
    write_packed(&output_dir, "documents", &documents_serialised_entries);

    generate_worker_js(&output_dir, document_encoding, maximum_query_bytes, maximum_query_terms, popular_terms_index.get_raw_lookup(), &normal_terms_index_raw_lookup, &documents_raw_lookup);
    generate_and_compile_runner_wasm(&output_dir, maximum_query_results, maximum_query_bytes, maximum_query_terms);
    println!("Build complete")
}
