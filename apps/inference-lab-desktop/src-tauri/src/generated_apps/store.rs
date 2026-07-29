use std::{fs, path::Path};

use serde::Serialize;
use serde_json::{json, Value};

use super::{
    capabilities::validate_permissions,
    display_error, is_entity_id,
    publishing::{validate_compiled_imports, validate_source, MAX_BUNDLE_BYTES},
    types::{GeneratedAppRecord, GeneratedAppSummary, SaveGeneratedAppStateInput},
};

const MAX_STATE_BYTES: usize = 64 * 1024;

pub(super) fn authoring_record(record: &GeneratedAppRecord) -> Value {
    json!({
        "id": record.id,
        "title": record.title,
        "description": record.description,
        "revision": record.revision,
        "permissions": record.permissions,
        "source": record.source
    })
}

#[tauri::command]
pub(crate) fn list_generated_apps(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<GeneratedAppSummary>, String> {
    let directory = apps_dir(&state.data_dir);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut apps = fs::read_dir(directory)
        .map_err(display_error)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            read_record(&state.data_dir, &entry.file_name().to_string_lossy())
                .ok()
                .flatten()
        })
        .map(|record| GeneratedAppSummary {
            id: record.id,
            title: record.title,
            description: record.description,
            revision: record.revision,
            authoring_chat_id: record.authoring_chat_id,
            updated_at_ms: record.updated_at_ms,
        })
        .collect::<Vec<_>>();
    apps.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    Ok(apps)
}

#[tauri::command]
pub(crate) fn get_generated_app(
    state: tauri::State<'_, crate::AppState>,
    app_id: String,
) -> Result<Option<GeneratedAppRecord>, String> {
    read_record(&state.data_dir, &app_id)
}

#[tauri::command]
pub(crate) fn get_generated_app_state(
    state: tauri::State<'_, crate::AppState>,
    app_id: String,
) -> Result<Value, String> {
    read_record(&state.data_dir, &app_id)?.ok_or_else(|| "Local app was not found.".to_string())?;
    let path = apps_dir(&state.data_dir).join(&app_id).join("state.json");
    if !path.exists() {
        return Ok(json!({}));
    }
    let stored: Value =
        serde_json::from_slice(&fs::read(path).map_err(display_error)?).map_err(display_error)?;
    validate_state(&stored)?;
    Ok(stored)
}

#[tauri::command]
pub(crate) fn save_generated_app_state(
    state: tauri::State<'_, crate::AppState>,
    input: SaveGeneratedAppStateInput,
) -> Result<(), String> {
    let record = read_record(&state.data_dir, &input.app_id)?
        .ok_or_else(|| "Local app was not found.".to_string())?;
    if record.revision != input.revision {
        return Err("The app changed. Reload it before saving state.".to_string());
    }
    let value = Value::Object(input.state);
    validate_state(&value)?;
    write_json_atomic(
        &apps_dir(&state.data_dir)
            .join(&record.id)
            .join("state.json"),
        &value,
    )
}

fn validate_state(value: &Value) -> Result<(), String> {
    let state = value
        .as_object()
        .ok_or_else(|| "Local app state must be an object.".to_string())?;
    if state.keys().any(|key| !is_entity_id(key)) {
        return Err("Local app state contains an invalid key.".to_string());
    }
    if serde_json::to_vec(value).map_err(display_error)?.len() > MAX_STATE_BYTES {
        return Err("Persisted app state is too large.".to_string());
    }
    Ok(())
}

pub(super) fn apps_dir(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("apps")
}

pub(super) fn read_record(
    data_dir: &Path,
    app_id: &str,
) -> Result<Option<GeneratedAppRecord>, String> {
    if !is_entity_id(app_id) {
        return Err("Invalid local app id.".to_string());
    }
    let path = apps_dir(data_dir).join(app_id).join("app.json");
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(display_error)?;
    let record: GeneratedAppRecord = serde_json::from_slice(&bytes).map_err(display_error)?;
    validate_source(&record.source)?;
    validate_permissions(&record.permissions)?;
    if record.bundle.len() > MAX_BUNDLE_BYTES {
        return Err("Stored local app bundle is too large.".to_string());
    }
    validate_compiled_imports(&record.bundle)?;
    Ok(Some(record))
}

pub(super) fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(display_error)?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes).map_err(display_error)?;
    fs::rename(temporary, path).map_err(display_error)
}
