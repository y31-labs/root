use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde_json::{json, Value};

use super::{
    catalog::catalog_result,
    display_error,
    publishing::publish_app,
    store::{authoring_record, read_record},
    types::PublishAppInput,
};

#[derive(Clone)]
pub(crate) struct AppToolRuntime {
    data_dir: PathBuf,
    threads: Arc<Mutex<HashMap<String, String>>>,
}

impl AppToolRuntime {
    pub(crate) fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            threads: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(crate) fn bind_thread(&self, thread_id: &str, chat_id: &str) -> Result<(), String> {
        self.threads
            .lock()
            .map_err(display_error)?
            .insert(thread_id.to_string(), chat_id.to_string());
        Ok(())
    }

    pub(crate) fn handle_tool_call(&self, message: &Value) -> Result<Value, String> {
        let params = message
            .get("params")
            .ok_or_else(|| "App tool request has no params.".to_string())?;
        let thread_id = params
            .get("threadId")
            .and_then(Value::as_str)
            .ok_or_else(|| "App tool request has no thread id.".to_string())?;
        let tool = params
            .get("tool")
            .and_then(Value::as_str)
            .ok_or_else(|| "App tool request has no tool name.".to_string())?;
        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let chat_id = self
            .threads
            .lock()
            .map_err(display_error)?
            .get(thread_id)
            .cloned()
            .ok_or_else(|| "This Codex thread is not authorized to edit local apps.".to_string())?;

        let result = match tool {
            "local_app_catalog" => catalog_result(),
            "local_app_read" => {
                let app_id = required_string(&arguments, "appId")?;
                let record = read_record(&self.data_dir, app_id)?
                    .ok_or_else(|| format!("Local app `{app_id}` was not found."))?;
                if record.authoring_chat_id != chat_id {
                    return Err("This chat does not own the requested app.".to_string());
                }
                authoring_record(&record)
            }
            "local_app_publish" => {
                let input: PublishAppInput =
                    serde_json::from_value(arguments).map_err(display_error)?;
                let record = publish_app(&self.data_dir, &chat_id, thread_id, input)?;
                json!({
                    "id": record.id,
                    "title": record.title,
                    "description": record.description,
                    "revision": record.revision,
                    "permissions": record.permissions
                })
            }
            _ => return Err(format!("Unknown local app tool `{tool}`.")),
        };

        Ok(json!({
            "success": true,
            "contentItems": [{
                "type": "inputText",
                "text": serde_json::to_string(&result).map_err(display_error)?
            }]
        }))
    }
}

fn required_string<'a>(value: &'a Value, field: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("`{field}` must be a string."))
}
