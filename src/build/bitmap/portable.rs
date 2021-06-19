use roaring::RoaringBitmap;

pub struct Bitmap {
    bitmap: RoaringBitmap,
}

impl Bitmap {
    #[inline]
    pub fn create() -> Self {
        Bitmap { bitmap: RoaringBitmap::new() }
    }

    #[inline]
    pub fn add(&mut self, element: u32) {
        self.bitmap.insert(element);
    }

    #[inline]
    pub fn run_optimize(&mut self) {
        // Not implemented by RoaringBitmap.
    }

    #[inline]
    pub fn get_serialized_size_in_bytes(&self) -> usize {
        self.bitmap.serialized_size()
    }

    #[inline]
    pub fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::new();
        self.bitmap.serialize_into(&mut out).unwrap();
        out
    }
}
