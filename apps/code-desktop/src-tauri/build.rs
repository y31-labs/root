mod build_provenance;

fn main() {
    build_provenance::emit().expect("failed to generate native build provenance");
    tauri_build::build()
}
