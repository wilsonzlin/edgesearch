#[cfg(feature = "default")]
pub mod portable;
#[cfg(feature = "default")]
pub use portable as bitmap;
#[cfg(feature = "nonportable")]
pub mod nonportable;
#[cfg(feature = "nonportable")]
pub use nonportable as bitmap;
