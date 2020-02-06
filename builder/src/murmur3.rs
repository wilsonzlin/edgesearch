use bytes::{Buf, Bytes};

#[inline(always)]
fn fmix32(mut h: u32) -> u32 {
    h ^= h >> 16;
    h *= 0x85ebca6b;
    h ^= h >> 13;
    h *= 0xc2b2ae35;
    h ^= h >> 16;

    return h;
}

#[inline(always)]
fn fmix64(mut k: u64) -> u64 {
    k ^= k >> 33;
    k *= 0xff51afd7ed558ccdu64;
    k ^= k >> 33;
    k *= 0xc4ceb9fe1a85ec53u64;
    k ^= k >> 33;

    return k;
}

pub fn mmh3_x86_32(key: Vec<u8>, seed: u32) -> u32 {
    let mut data = Bytes::from(key);

    let len = data.len();
    let nblocks = len / 4;

    let mut h1 = seed;

    let c1 = 0xcc9e2d51u32;
    let c2 = 0x1b873593u32;

    for _ in 0..nblocks {
        let mut k1 = data.get_u32_le();

        k1 *= c1;
        k1 = k1.rotate_left(15);
        k1 *= c2;

        h1 ^= k1;
        h1 = h1.rotate_left(13);
        h1 = h1 * 5 + 0xe6546b64;
    };

    let tail = &data[..];
    assert!(tail.len() <= 3);

    let mut k1 = 0u32;

    if tail.len() >= 3 {
        k1 ^= (tail[2] as u32) << 16;
    };
    if tail.len() >= 2 {
        k1 ^= (tail[1] as u32) << 8;
    };
    if tail.len() >= 1 {
        k1 ^= tail[0] as u32;
        k1 *= c1;
        k1 = k1.rotate_left(15);
        k1 *= c2;
        h1 ^= k1;
    };

    h1 ^= len as u32;
    h1 = fmix32(h1);

    return h1;
}

pub fn mmh3_x64_128(key: Vec<u8>, seed: u32) -> [u64; 2] {
    let mut data = Bytes::from(key);

    let len = data.len();
    let nblocks = len / 16;

    let mut h1 = seed as u64;
    let mut h2 = seed as u64;

    let c1 = 0x87c37b91114253d5u64;
    let c2 = 0x4cf5ad432745937fu64;

    for _ in 0..nblocks {
        let mut k1 = data.get_u64_le();
        let mut k2 = data.get_u64_le();

        k1 *= c1;
        k1 = k1.rotate_left(31);
        k1 *= c2;
        h1 ^= k1;

        h1 = h1.rotate_left(27);
        h1 += h2;
        h1 = h1 * 5 + 0x52dce729;

        k2 *= c2;
        k2 = k2.rotate_left(33);
        k2 *= c1;
        h2 ^= k2;

        h2 = h2.rotate_left(31);
        h2 += h1;
        h2 = h2 * 5 + 0x38495ab5;
    }

    let tail = &data[..];
    assert!(tail.len() <= 15);

    let mut k1 = 0;
    let mut k2 = 0;

    if tail.len() >= 15 { k2 ^= (tail[14] as u64) << 48; };
    if tail.len() >= 14 { k2 ^= (tail[13] as u64) << 40; };
    if tail.len() >= 13 { k2 ^= (tail[12] as u64) << 32; };
    if tail.len() >= 12 { k2 ^= (tail[11] as u64) << 24; };
    if tail.len() >= 11 { k2 ^= (tail[10] as u64) << 16; };
    if tail.len() >= 10 { k2 ^= (tail[9] as u64) << 8; };
    if tail.len() >= 9 {
        k2 ^= (tail[8] as u64) << 0;
        k2 *= c2;
        k2 = k2.rotate_left(33);
        k2 *= c1;
        h2 ^= k2;
    };

    if tail.len() >= 8 { k1 ^= (tail[7] as u64) << 56; };
    if tail.len() >= 7 { k1 ^= (tail[6] as u64) << 48; };
    if tail.len() >= 6 { k1 ^= (tail[5] as u64) << 40; };
    if tail.len() >= 5 { k1 ^= (tail[4] as u64) << 32; };
    if tail.len() >= 4 { k1 ^= (tail[3] as u64) << 24; };
    if tail.len() >= 3 { k1 ^= (tail[2] as u64) << 16; };
    if tail.len() >= 2 { k1 ^= (tail[1] as u64) << 8; };
    if tail.len() >= 1 {
        k1 ^= (tail[0] as u64) << 0;
        k1 *= c1;
        k1 = k1.rotate_left(31);
        k1 *= c2;
        h1 ^= k1;
    };

    h1 ^= len as u64;
    h2 ^= len as u64;

    h1 += h2;
    h2 += h1;

    h1 = fmix64(h1);
    h2 = fmix64(h2);

    h1 += h2;
    h2 += h1;

    return [h1, h2];
}
