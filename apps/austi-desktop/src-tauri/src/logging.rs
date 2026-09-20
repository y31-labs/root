use std::{error::Error, path::Path};

use tracing_appender::{
    non_blocking::WorkerGuard,
    rolling::{RollingFileAppender, Rotation},
};
use tracing_subscriber::{
    filter::EnvFilter, layer::SubscriberExt, util::SubscriberInitExt, Layer, Registry,
};

pub(crate) const EXTERNAL_EVENT_TARGET: &str = "y31::external_event";
const LOG_FILE_LIMIT: usize = 14;

pub(crate) type ExternalLogLayer = Box<dyn Layer<Registry> + Send + Sync + 'static>;

pub(crate) struct LoggingGuard {
    _file_guard: WorkerGuard,
}

pub(crate) fn initialize(
    log_directory: &Path,
    external_layers: Vec<ExternalLogLayer>,
) -> Result<LoggingGuard, Box<dyn Error + Send + Sync>> {
    std::fs::create_dir_all(log_directory)?;
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("y31")
        .filename_suffix("jsonl")
        .max_log_files(LOG_FILE_LIMIT)
        .build(log_directory)?;
    let (file_writer, file_guard) = tracing_appender::non_blocking(file_appender);
    let filter =
        EnvFilter::try_from_env("Y31_LOG").unwrap_or_else(|_| EnvFilter::new("info,y31=debug"));
    let file_layer = tracing_subscriber::fmt::layer()
        .json()
        .flatten_event(true)
        .with_ansi(false)
        .with_writer(file_writer)
        .with_filter(filter)
        .boxed();
    let mut layers = Vec::with_capacity(external_layers.len() + 1);
    layers.push(file_layer);
    layers.extend(external_layers);

    // A future PostHog layer belongs in `external_layers`. It should filter to
    // EXTERNAL_EVENT_TARGET and allowlist event names/fields before sending data.
    Registry::default().with(layers).try_init()?;

    Ok(LoggingGuard {
        _file_guard: file_guard,
    })
}
