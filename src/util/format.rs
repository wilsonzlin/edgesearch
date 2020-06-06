use std::fmt::Display;

pub fn round2(dec: f64) -> String {
    format!("{}", (dec * 100.0).round() / 100f64)
}

pub fn percent(ratio: f64) -> String {
    format!("{}%", round2(ratio * 100.0))
}

pub fn number<T: Display>(n: T) -> String {
    let mut s = format!("{}", n);
    if s.len() > 3 {
        let mut i = s.len() - 3;
        while i > 0 {
            s.insert(i, ',');
            if i <= 3 {
                break;
            };
            i -= 3;
        };
    };
    s
}
