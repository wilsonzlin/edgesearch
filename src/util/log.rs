macro_rules! interval_log {
    ($interval:expr, $no:expr, $len:expr, $fmt:literal) => {
        if $no % $interval == 0 {
            println!($fmt, percent($no as f64 / $len as f64));
        };
    };
}

pub(crate) fn status_log_interval(len: usize, times: usize) -> usize {
    1 << (((len as f64) / (times as f64)).log2().ceil() as usize)
}
