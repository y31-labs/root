use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

use super::{
    capabilities::validate_permissions,
    catalog::{ALLOWED_IMPORTS, ICON_EXPORTS, REACT_EXPORTS, SDK_EXPORTS, UI_EXPORTS},
    display_error, is_entity_id, now_ms,
    store::{apps_dir, read_record, write_json_atomic},
    types::{GeneratedAppRecord, PublishAppInput},
};

const MAX_SOURCE_BYTES: usize = 128 * 1024;
pub(super) const MAX_BUNDLE_BYTES: usize = 512 * 1024;

pub(super) fn publish_app(
    data_dir: &Path,
    chat_id: &str,
    thread_id: &str,
    input: PublishAppInput,
) -> Result<GeneratedAppRecord, String> {
    validate_metadata(&input)?;
    validate_source(&input.source)?;
    validate_permissions(&input.permissions)?;
    let current = read_record(data_dir, &input.app_id)?;
    let current_revision = current.as_ref().map_or(0, |record| record.revision);
    if current_revision != input.expected_revision {
        return Err(format!(
            "Stale app revision: expected {current_revision}, received {}. Read the app and retry.",
            input.expected_revision
        ));
    }
    if current
        .as_ref()
        .is_some_and(|record| record.authoring_chat_id != chat_id)
    {
        return Err("This chat does not own the requested app.".to_string());
    }

    let bundle = compile_source(data_dir, &input.app_id, &input.source)?;
    let record = GeneratedAppRecord {
        id: input.app_id.clone(),
        title: input.title,
        description: input.description,
        revision: current_revision + 1,
        authoring_chat_id: chat_id.to_string(),
        authoring_thread_id: thread_id.to_string(),
        updated_at_ms: now_ms(),
        source: input.source,
        bundle,
        permissions: input.permissions,
    };
    let app_dir = apps_dir(data_dir).join(&record.id);
    let versions_dir = app_dir.join("versions");
    fs::create_dir_all(&versions_dir).map_err(display_error)?;
    write_json_atomic(
        &versions_dir.join(format!("{}.json", record.revision)),
        &record,
    )?;
    write_json_atomic(&app_dir.join("app.json"), &record)?;
    Ok(record)
}

fn validate_metadata(input: &PublishAppInput) -> Result<(), String> {
    if !is_entity_id(&input.app_id) {
        return Err("appId must be a lowercase entity id up to 80 characters.".to_string());
    }
    if input.title.trim().is_empty() || input.title.chars().count() > 160 {
        return Err("title must contain 1 to 160 characters.".to_string());
    }
    if input.description.trim().is_empty() || input.description.chars().count() > 2_000 {
        return Err("description must contain 1 to 2,000 characters.".to_string());
    }
    Ok(())
}

pub(super) fn validate_source(source: &str) -> Result<(), String> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(format!(
            "App.tsx exceeds the {MAX_SOURCE_BYTES} byte limit."
        ));
    }
    if !source.contains("export default function") {
        return Err("App.tsx must export a default named function component.".to_string());
    }
    for module in import_specifiers(source)? {
        if !ALLOWED_IMPORTS.contains(&module.as_str()) {
            return Err(format!("Import `{module}` is not available to local apps."));
        }
    }
    for forbidden in [
        "@tauri-apps",
        "dangerouslySetInnerHTML",
        "import(",
        "import (",
        "eval(",
        "Function(",
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "Worker(",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "globalThis",
        "document.",
        "window.",
        "navigator.",
        "location.",
        "parent.",
        "postMessage",
        "require(",
        ".constructor",
        ".prototype",
    ] {
        if source.contains(forbidden) {
            return Err(format!("App.tsx cannot use `{forbidden}`."));
        }
    }
    let lowercase = source.to_ascii_lowercase();
    for forbidden_tag in ["<script", "<iframe", "<object", "<embed", "<link", "<meta"] {
        if lowercase.contains(forbidden_tag) {
            return Err(format!("App.tsx cannot render `{forbidden_tag}>`."));
        }
    }
    Ok(())
}

fn import_specifiers(source: &str) -> Result<Vec<String>, String> {
    let mut modules = Vec::new();
    for statement in source.split(';') {
        let trimmed = statement.trim();
        let Some(import_start) = trimmed.find("import ") else {
            continue;
        };
        let import_statement = &trimmed[import_start..];
        let module_start = import_statement
            .rfind(" from ")
            .map(|index| index + 6)
            .unwrap_or("import ".len());
        let module = import_statement[module_start..].trim();
        let quote = module
            .chars()
            .next()
            .filter(|character| matches!(character, '\'' | '"'))
            .ok_or_else(|| "Every import must use a quoted module name.".to_string())?;
        let end = module[1..]
            .find(quote)
            .ok_or_else(|| "An import has an unterminated module name.".to_string())?;
        modules.push(module[1..end + 1].to_string());
    }
    Ok(modules)
}

pub(super) fn validate_compiled_imports(bundle: &str) -> Result<(), String> {
    for statement in bundle.split(';') {
        let trimmed = statement.trim();
        let Some(import_start) = trimmed.find("import ") else {
            continue;
        };
        let import_statement = &trimmed[import_start..];
        let from_index = import_statement
            .rfind(" from ")
            .ok_or_else(|| "The compiler emitted an unsupported import.".to_string())?;
        let clause = import_statement["import ".len()..from_index].trim();
        let module = import_specifiers(import_statement)?
            .into_iter()
            .next()
            .ok_or_else(|| "The compiler emitted an import without a module.".to_string())?;
        if !ALLOWED_IMPORTS.contains(&module.as_str()) {
            return Err(format!(
                "The compiler emitted unsupported import `{module}`."
            ));
        }
        let named_clause = if module == "react" && clause == "React" {
            continue;
        } else if module == "react" && clause.starts_with("React,") {
            clause.trim_start_matches("React,").trim()
        } else {
            clause
        };
        if !named_clause.starts_with('{') || !named_clause.ends_with('}') {
            return Err(format!(
                "Local app imports from `{module}` must use documented named exports."
            ));
        }
        let allowed = match module.as_str() {
            "react" => REACT_EXPORTS.as_slice(),
            "@y31/local-app" => SDK_EXPORTS.as_slice(),
            "@y31/local-app/ui" => UI_EXPORTS.as_slice(),
            "@y31/local-app/icons" => ICON_EXPORTS.as_slice(),
            _ => unreachable!(),
        };
        for imported in named_clause[1..named_clause.len() - 1]
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
        {
            let name = imported.split_whitespace().next().unwrap_or_default();
            if !allowed.contains(&name) {
                return Err(format!("`{name}` is not exported by `{module}`."));
            }
        }
    }
    Ok(())
}

pub(super) fn compile_source(
    data_dir: &Path,
    app_id: &str,
    source: &str,
) -> Result<String, String> {
    let build_dir = apps_dir(data_dir)
        .join(".build")
        .join(format!("{app_id}-{}", now_ms()));
    fs::create_dir_all(&build_dir).map_err(display_error)?;
    let entry = build_dir.join("App.tsx");
    let output_path = build_dir.join("app.js");
    fs::write(&entry, format!("import React from 'react';\n{source}")).map_err(display_error)?;
    let output = Command::new(bun_executable()?)
        .arg("build")
        .arg(&entry)
        .args([
            "--target=browser",
            "--external=*",
            "--jsx-runtime=classic",
            "--sourcemap=none",
        ])
        .arg(format!("--outfile={}", output_path.display()))
        .current_dir(&build_dir)
        .output()
        .map_err(|error| format!("The local Bun compiler is unavailable: {error}"))?;
    let result = (|| {
        if !output.status.success() {
            let details = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "App.tsx did not compile:\n{}",
                details.chars().take(4_000).collect::<String>()
            ));
        }
        let bundle = fs::read_to_string(&output_path).map_err(display_error)?;
        if bundle.len() > MAX_BUNDLE_BYTES {
            return Err(format!(
                "Compiled app exceeds the {MAX_BUNDLE_BYTES} byte limit."
            ));
        }
        validate_compiled_imports(&bundle)?;
        Ok(bundle)
    })();
    let _ = fs::remove_dir_all(&build_dir);
    result
}

fn bun_executable() -> Result<PathBuf, String> {
    let executable_name = if cfg!(windows) { "bun.exe" } else { "bun" };
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path) {
            let candidate = directory.join(executable_name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    if let Some(home) = env::var_os("HOME") {
        let candidate = PathBuf::from(home).join(".bun/bin").join(executable_name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(
        "The local Bun compiler is unavailable. Install Bun before creating local apps."
            .to_string(),
    )
}
