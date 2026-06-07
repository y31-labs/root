use std::{env, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=WORKOS_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=CODE_DESKTOP_KEYCHAIN");

    let env_path =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("missing manifest directory"))
            .join("../.env");
    println!("cargo:rerun-if-changed={}", env_path.display());

    let client_id = env::var("WORKOS_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            dotenvy::from_path_iter(&env_path)
                .ok()?
                .find_map(|entry| match entry.ok()? {
                    (key, value) if key == "WORKOS_CLIENT_ID" && !value.trim().is_empty() => {
                        Some(value)
                    }
                    _ => None,
                })
        });

    if let Some(client_id) = client_id {
        assert!(
            !client_id.contains(['\r', '\n']),
            "WORKOS_CLIENT_ID must not contain newlines"
        );
        println!("cargo:rustc-env=WORKOS_CLIENT_ID={client_id}");
    }

    let keychain_enabled = env::var("CODE_DESKTOP_KEYCHAIN")
        .ok()
        .is_some_and(|value| value == "1");
    println!(
        "cargo:rustc-env=CODE_DESKTOP_KEYCHAIN={}",
        if keychain_enabled { "1" } else { "0" }
    );

    tauri_build::build()
}
