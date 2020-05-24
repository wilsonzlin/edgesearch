// Load before other modules which depend on macros in here.
#[macro_use]
mod util;
mod data;
pub mod build;
pub mod deploy;

// JavaScript and Roaring Bitmaps only support 32-bit integers.
#[allow(dead_code)]
type DocumentId = u32;
#[allow(dead_code)]
type Term = String;
#[allow(dead_code)]
type TermId = usize;
