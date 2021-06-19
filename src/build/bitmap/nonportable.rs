// Inspired by https://github.com/saulius/croaring-rs/blob/master/croaring/src/bitmap/imp.rs.
use std::convert::TryInto;

pub struct Bitmap {
    bitmap: *mut croaring_sys::roaring_bitmap_s,
}

unsafe impl Sync for Bitmap {}
unsafe impl Send for Bitmap {}

impl Bitmap {
    #[inline]
    pub fn create() -> Self {
        let bitmap = unsafe { croaring_sys::roaring_bitmap_create_with_capacity(0) };

        Bitmap { bitmap }
    }

    #[inline]
    pub fn add(&mut self, element: u32) {
        unsafe { croaring_sys::roaring_bitmap_add(self.bitmap, element); };
    }

    #[inline]
    pub fn run_optimize(&mut self) {
        unsafe { croaring_sys::roaring_bitmap_run_optimize(self.bitmap); }
    }

    #[inline]
    pub fn get_serialized_size_in_bytes(&self) -> usize {
        unsafe { croaring_sys::roaring_bitmap_size_in_bytes(self.bitmap).try_into().unwrap() }
    }

    #[inline]
    pub fn serialize(&self) -> Vec<u8> {
        let capacity = self.get_serialized_size_in_bytes();
        let mut dst = Vec::with_capacity(capacity);

        unsafe {
            croaring_sys::roaring_bitmap_serialize(
                self.bitmap,
                dst.as_mut_ptr() as *mut ::libc::c_char,
            );
            dst.set_len(capacity);
        }

        dst
    }
}
