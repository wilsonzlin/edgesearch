// Load before other modules which depend on macros in here.
#[macro_use]
pub(crate) mod util;
pub mod build;
pub mod deploy;

pub(crate) const DOCUMENT_ID_BYTES: usize = 4;

pub(crate) type Term = Vec<u8>;
pub(crate) type TermId = usize;
