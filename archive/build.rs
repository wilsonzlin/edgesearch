fn main() {
    assert!(error > 0.0 && error < 1.0);
    // If popular is zero, bloom filter matrix is not used.
    // If popular is one, postings list is not used.
    assert!(popular >= 0.0 && popular <= 1.0);


    let popular_cutoff = (popular * instance_count as f64).ceil() as usize;
    let mut popular_instance_count = 0;
    let mut popular_reduced_postings_list_combined_keys_bytes: usize = 0;
    let mut popular_reduced_postings_list_combined_values_bytes: usize = 0;
    let mut popular_terms = HashSet::<TermId>::new();
    for (term_id, count) in highest_term_freqs.iter() {
        if popular_instance_count + *count > popular_cutoff {
            break;
        };
        popular_terms.insert(*term_id);
        popular_instance_count += *count;
        popular_reduced_postings_list_combined_keys_bytes += terms[*term_id].len();
        popular_reduced_postings_list_combined_values_bytes += DOCUMENT_ID_BYTES * *count;
    };

    let popular_term_count = popular_terms.len();
    let mut popular_fully_reachable: usize = 0;
    let mut popular_partially_reachable: usize = 0;
    let mut popular_unreachable: usize = 0;
    for doc in terms_by_document.iter() {
        let mut some = false;
        let mut every = true;
        for term_id in doc {
            if popular_terms.contains(term_id) {
                some = true;
            } else {
                every = false;
            };
        };
        if every {
            popular_fully_reachable += 1;
        } else if some {
            popular_partially_reachable += 1;
        } else {
            popular_unreachable += 1;
        };
    };

    let bits_per_element = -(error.ln() / 2.0f64.ln().powi(2));
    let bits: usize = (bits_per_element * popular_term_count as f64).ceil() as usize;
    let hashes: usize = (2.0f64.ln() * bits_per_element).ceil() as usize;

    println!();
    println!("Information about worker \"{}\":", name);
    println!("- There are {docs} documents, each having between {min} and {max} instances with an average of {avg}.",
        docs = number(document_count),
        min = terms_by_document.iter().map(|t| t.len()).min().unwrap(),
        max = terms_by_document.iter().map(|t| t.len()).max().unwrap(),
        avg = number(average_int(instance_count, document_count)),
    );
    println!("- {popular_term_count} of {term_count} terms ({popular_terms_pc}) represent {popular_instance_count} of {instance_count} ({popular_instance_count_pc}) instances, reaching {popular_fully_reachable} ({popular_fully_reachable_pc}) documents fully and {popular_partially_reachable} ({popular_partially_reachable_pc}) partially, and not reaching {popular_unreachable} ({popular_unreachable_pc}) at all.",
        popular_term_count = number(popular_term_count),
        term_count = number(term_count),
        popular_terms_pc = frac_perc(popular_term_count, term_count),
        popular_instance_count = number(popular_instance_count),
        instance_count = number(instance_count),
        popular_instance_count_pc = frac_perc(popular_instance_count, instance_count),
        popular_fully_reachable = number(popular_fully_reachable),
        popular_fully_reachable_pc = frac_perc(popular_fully_reachable, document_count),
        popular_partially_reachable = number(popular_partially_reachable),
        popular_partially_reachable_pc = frac_perc(popular_partially_reachable, document_count),
        popular_unreachable = number(popular_unreachable),
        popular_unreachable_pc = frac_perc(popular_unreachable, document_count),
    );
    println!("- The bloom filter matrix will have {bits} bits per document (i.e. rows), {bpe} bits per element, and {hashes} hashes.",
        bits = number(bits),
        bpe = round2(bits_per_element),
        hashes = hashes,
    );

    println!("- Use of the bloom filter reduces postings list size by {} ({}) in keys and {} ({}) in values, bring them to {} and {} respectively.",
        bytes(popular_reduced_postings_list_combined_keys_bytes),
        frac_perc(popular_reduced_postings_list_combined_keys_bytes, postings_list_combined_keys_bytes),
        bytes(popular_reduced_postings_list_combined_values_bytes),
        frac_perc(popular_reduced_postings_list_combined_values_bytes, postings_list_combined_values_bytes),
        bytes(postings_list_combined_keys_bytes - popular_reduced_postings_list_combined_keys_bytes),
        bytes(postings_list_combined_values_bytes - popular_reduced_postings_list_combined_values_bytes),
    );

    println!("- Top 20 terms: ");
    for (no, (term_id, count)) in highest_term_freqs[..20].iter().enumerate() {
        println!("  {:>2}. {:<25} ({} instances)", no + 1, std::str::from_utf8(&terms[*term_id]).unwrap(), number(*count));
    };
    println!();

    // This is a matrix. Each bit is represented by a bit set with `document_count` bits.
    // For example, assume "hello" is in document with index 5 and hashes to bits {3, 7, 10}.
    // Then the bit sets for bits {3, 7, 10} have their 5th bit set to 1.
    let mut matrix = Vec::<Bitmap>::with_capacity(bits);
    for _ in 0..bits {
        matrix.push(Bitmap::create());
    };

    let mut matrix_instances: usize = 0;


    if popular_terms.contains(term_id) {
        // This is a popular term, so add it to the bloom filter matrix instead of the postings list.
        let [a, b] = mmh3_x64_128(terms[*term_id].clone(), 0);
        for i in 0..hashes {
            let bit: usize = ((a * (b + (i as u64))) % (bits as u64)) as usize;
            matrix[bit].add(document_id as u32);
        };
        matrix_instances += 1;
    }

    println!();
    if matrix_instances == 0 {
        println!("Matrix is not utilised");
    } else {
        println!("Optimising matrix with {} instances...", number(matrix_instances));
        for bitmap in matrix.iter_mut() {
            bitmap.run_optimize();
        };
        write_bloom_filter_matrix(&output_dir, &matrix, bits, document_count);
    };
}
