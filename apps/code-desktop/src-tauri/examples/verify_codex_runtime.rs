#![allow(dead_code)]

#[path = "../src/runtime_readiness.rs"]
mod runtime_readiness;

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn main() {
    let runtime = tokio::runtime::Runtime::new().expect("Tokio runtime should start");
    if let Err(error) = runtime.block_on(runtime_readiness::probe_codex_protocol(
        std::path::Path::new("codex"),
    )) {
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!("Codex app-server protocol is compatible.");
}
