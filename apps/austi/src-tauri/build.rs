use std::{env, fs, path::PathBuf};

fn main() {
    prepare_bun_sidecar();
    tauri_build::build()
}

fn prepare_bun_sidecar() {
    println!("cargo:rerun-if-env-changed=PATH");

    let target = env::var("TARGET").expect("Cargo did not provide a target triple");
    let executable_name = if cfg!(windows) { "bun.exe" } else { "bun" };
    let bun = env::var_os("PATH")
        .and_then(|path| {
            env::split_paths(&path)
                .map(|directory| directory.join(executable_name))
                .find(|candidate| candidate.is_file())
        })
        .expect("Bun must be available while building Austi so it can be bundled as a sidecar");
    let binaries_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("binaries");
    fs::create_dir_all(&binaries_dir).expect("failed to create the sidecar directory");

    let extension = if cfg!(windows) { ".exe" } else { "" };
    let destination = binaries_dir.join(format!("bun-{target}{extension}"));
    fs::copy(&bun, &destination).expect("failed to copy Bun into the Tauri sidecar directory");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(&destination)
            .expect("failed to read Bun sidecar metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&destination, permissions)
            .expect("failed to make the Bun sidecar executable");
    }
}
