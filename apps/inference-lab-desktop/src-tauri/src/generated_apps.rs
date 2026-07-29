use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_SOURCE_BYTES: usize = 128 * 1024;
const MAX_BUNDLE_BYTES: usize = 512 * 1024;
const MAX_CAPABILITY_INPUT_BYTES: usize = 32 * 1024;
const MAX_CAPABILITY_OUTPUT_BYTES: usize = 1024 * 1024;
const MAX_STATE_BYTES: usize = 64 * 1024;
const ALLOWED_IMPORTS: [&str; 4] = [
    "react",
    "@y31/local-app",
    "@y31/local-app/ui",
    "@y31/local-app/icons",
];
const REACT_EXPORTS: [&str; 15] = [
    "Children",
    "Fragment",
    "cloneElement",
    "createContext",
    "createElement",
    "forwardRef",
    "memo",
    "useCallback",
    "useContext",
    "useEffect",
    "useId",
    "useMemo",
    "useReducer",
    "useRef",
    "useState",
];
const SDK_EXPORTS: [&str; 3] = ["useAppInfo", "useCapability", "usePersistentState"];
const UI_EXPORTS: [&str; 20] = [
    "AppStyles",
    "Badge",
    "Box",
    "Button",
    "DataTable",
    "Field",
    "Grid",
    "Inline",
    "Input",
    "Label",
    "Page",
    "Section",
    "SelectField",
    "Separator",
    "SliderField",
    "Stack",
    "Stat",
    "Surface",
    "SwitchField",
    "Textarea",
];
const ICON_EXPORTS: [&str; 25] = [
    "Activity",
    "Bell",
    "Calendar",
    "Check",
    "ChevronDown",
    "ChevronRight",
    "CircleAlert",
    "Clock",
    "Database",
    "FileText",
    "Filter",
    "Gauge",
    "Inbox",
    "Info",
    "LoaderCircle",
    "MessageSquare",
    "Pause",
    "Play",
    "RefreshCw",
    "Search",
    "Settings",
    "Sparkles",
    "Triangle",
    "X",
    "Zap",
];

#[derive(Clone)]
pub(crate) struct AppToolRuntime {
    data_dir: PathBuf,
    threads: Arc<Mutex<HashMap<String, String>>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalAppPermission {
    capability_id: String,
    effects: Vec<String>,
    approval: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeneratedAppRecord {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) revision: u64,
    pub(crate) authoring_chat_id: String,
    pub(crate) authoring_thread_id: String,
    pub(crate) updated_at_ms: u64,
    pub(crate) source: String,
    pub(crate) bundle: String,
    pub(crate) permissions: Vec<LocalAppPermission>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeneratedAppSummary {
    id: String,
    title: String,
    description: String,
    revision: u64,
    authoring_chat_id: String,
    updated_at_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishAppInput {
    app_id: String,
    title: String,
    description: String,
    expected_revision: u64,
    source: String,
    permissions: Vec<LocalAppPermission>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InvokeCapabilityInput {
    app_id: String,
    revision: u64,
    capability_id: String,
    input: Value,
    approved: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveGeneratedAppStateInput {
    app_id: String,
    revision: u64,
    state: serde_json::Map<String, Value>,
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

pub(crate) fn dynamic_tool_specs() -> Vec<Value> {
    vec![
        tool(
            "local_app_catalog",
            "Read the local React app SDK, source restrictions, and complete starter example before creating or changing an app.",
            json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        ),
        tool(
            "local_app_read",
            "Read the React source and current revision of an app owned by this chat before revising it.",
            json!({
                "type": "object",
                "properties": { "appId": { "type": "string" } },
                "required": ["appId"],
                "additionalProperties": false
            }),
        ),
        tool(
            "local_app_publish",
            "Compile and publish a complete local React App.tsx. Call local_app_catalog first. Use expectedRevision 0 for a new app.",
            json!({
                "type": "object",
                "properties": {
                    "appId": { "type": "string", "description": "Stable lowercase app id." },
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "expectedRevision": { "type": "integer", "minimum": 0 },
                    "source": { "type": "string", "description": "Complete App.tsx source with a default function component export." },
                    "permissions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "capabilityId": { "type": "string" },
                                "effects": { "type": "array", "items": { "enum": ["read", "write", "network", "filesystem", "secret"] } },
                                "approval": { "enum": ["never", "first-use", "always"] }
                            },
                            "required": ["capabilityId", "effects", "approval"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["appId", "title", "description", "expectedRevision", "source", "permissions"],
                "additionalProperties": false
            }),
        ),
    ]
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({ "name": name, "description": description, "inputSchema": input_schema })
}

fn catalog_result() -> Value {
    json!({
        "contract": "Write one normal React App.tsx. Do not write a JSON UI document.",
        "imports": {
            "react": [
                "Children", "Fragment", "cloneElement", "createContext", "createElement", "forwardRef",
                "memo", "useCallback", "useContext", "useEffect", "useId", "useMemo", "useReducer",
                "useRef", "useState"
            ],
            "@y31/local-app": ["useAppInfo", "useCapability", "usePersistentState"],
            "@y31/local-app/ui": [
                "AppStyles", "Badge", "Box", "Button", "DataTable", "Field", "Grid", "Inline",
                "Input", "Label", "Page", "Section", "SelectField", "Separator", "SliderField",
                "Stack", "Stat", "Surface", "SwitchField", "Textarea"
            ],
            "@y31/local-app/icons": [
                "Activity", "Bell", "Calendar", "Check", "ChevronDown", "ChevronRight", "CircleAlert",
                "Clock", "Database", "FileText", "Filter", "Gauge", "Inbox", "Info", "LoaderCircle",
                "MessageSquare", "Pause", "Play", "RefreshCw", "Search", "Settings", "Sparkles",
                "Triangle", "X", "Zap"
            ]
        },
        "hooks": {
            "usePersistentState": "usePersistentState<T extends JsonValue>(key: string, initial: T): readonly [T, (next: T | ((current: T) => T)) => void]",
            "useCapability": "useCapability<Result extends JsonValue>(capabilityId: string): { data?: Result; error?: string; loading: boolean; run(input?: JsonValue): Promise<Result> }",
            "useAppInfo": "useAppInfo(): { id: string; title: string; description: string; revision: number }"
        },
        "uiSignatures": {
            "Page": "Page({ title: string, description?: string, actions?: ReactNode, children: ReactNode })",
            "Section": "Section({ title?: string, description?: string, children: ReactNode })",
            "Stack": "Stack({ gap?: 'sm' | 'md' | 'lg', className?: string, children: ReactNode })",
            "Inline": "Inline({ className?: string, children: ReactNode })",
            "Grid": "Grid({ columns?: 1 | 2 | 3 | 4, className?: string, children: ReactNode })",
            "Surface": "Surface({ className?: string, children: ReactNode })",
            "Field": "Field({ label: string, hint?: string, children: ReactNode })",
            "SliderField": "SliderField({ label: string, min: number, max: number, step?: number, value: number, onChange(value: number): void })",
            "SelectField": "SelectField({ label: string, value: string, options: Array<{ label: string; value: string }>, onChange(value: string): void })",
            "SwitchField": "SwitchField({ label: string, description?: string, checked: boolean, onChange(checked: boolean): void })",
            "Stat": "Stat({ label: string, value: ReactNode })",
            "DataTable": "DataTable({ columns: Array<{ key: string; label: string }>, rows: Array<Record<string, ReactNode>> })",
            "AppStyles": "AppStyles({ children: string })",
            "Box": "Box({ className?: string, style?: CSSProperties, children: ReactNode })",
            "primitives": "Badge, Button, Input, Label, Separator, and Textarea accept their standard shared React component props."
        },
        "styling": "Prefer SDK layout components. AppStyles accepts scoped standard CSS; use semantic CSS variables such as --background, --foreground, --muted, --primary, --border, --success, and --danger.",
        "capabilities": {
            "local.echo": { "effects": ["read"], "approval": "never" },
            "local.now": { "effects": ["read"], "approval": "never" },
            "mcp": "Declare mcp.<server>.<tool> with a network effect and first-use or always approval. run() returns the MCP response { content, isError?, structuredContent? }. The host owns OAuth, approval, and invocation."
        },
        "restrictions": [
            "Only the four documented import modules are allowed.",
            "No fetch, browser storage, workers, iframes, scripts, DOM globals, dynamic imports, eval, or native APIs.",
            "Export one default named function component. Files and capability access go through SDK hooks."
        ],
        "example": r#"import { useMemo } from 'react';
import { usePersistentState } from '@y31/local-app';
import { Grid, Page, Section, SelectField, SliderField, Stat, Surface } from '@y31/local-app/ui';

export default function App() {
  const [amplitude, setAmplitude] = usePersistentState('amplitude', 72);
  const [waveform, setWaveform] = usePersistentState('waveform', 'sine');
  const points = useMemo(() => Array.from({ length: 80 }, (_, index) => {
    const x = (index / 79) * 600;
    const y = 90 - Math.sin((index / 79) * Math.PI * 4) * amplitude * 0.7;
    return `${x},${y}`;
  }).join(' '), [amplitude]);

  return <Page title="Wave Playground" description="Shape a local signal.">
    <Surface><svg viewBox="0 0 600 180" role="img" aria-label="Wave preview"><polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3" /></svg></Surface>
    <Section title="Controls"><Grid columns={2}>
      <SliderField label="Amplitude" min={0} max={100} value={amplitude} onChange={setAmplitude} />
      <SelectField label="Waveform" value={waveform} onChange={setWaveform} options={[{ label: 'Sine', value: 'sine' }, { label: 'Triangle', value: 'triangle' }]} />
    </Grid></Section>
    <Stat label="Amplitude" value={amplitude} />
  </Page>;
}"#
    })
}

fn publish_app(
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

fn validate_source(source: &str) -> Result<(), String> {
    if source.as_bytes().len() > MAX_SOURCE_BYTES {
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

fn validate_compiled_imports(bundle: &str) -> Result<(), String> {
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

fn validate_permissions(permissions: &[LocalAppPermission]) -> Result<(), String> {
    if permissions.len() > 20 {
        return Err("A local app may request at most 20 capabilities.".to_string());
    }
    let mut ids = HashSet::new();
    for permission in permissions {
        if !is_entity_id(&permission.capability_id) || !ids.insert(&permission.capability_id) {
            return Err(format!(
                "Capability id `{}` is invalid or duplicated.",
                permission.capability_id
            ));
        }
        if permission.effects.is_empty()
            || permission.effects.len() > 5
            || permission.effects.iter().any(|effect| {
                !matches!(
                    effect.as_str(),
                    "read" | "write" | "network" | "filesystem" | "secret"
                )
            })
        {
            return Err(format!(
                "Capability `{}` has invalid effects.",
                permission.capability_id
            ));
        }
        if !matches!(
            permission.approval.as_str(),
            "never" | "first-use" | "always"
        ) {
            return Err(format!(
                "Capability `{}` has an invalid approval policy.",
                permission.capability_id
            ));
        }
        if permission.capability_id.starts_with("local.") {
            if !matches!(
                permission.capability_id.as_str(),
                "local.echo" | "local.now"
            ) {
                return Err(format!(
                    "Local capability `{}` is not installed.",
                    permission.capability_id
                ));
            }
            require_read_only_grant(permission)?;
        } else if permission.capability_id.starts_with("mcp.") {
            parse_mcp_capability(&permission.capability_id)?;
            if permission.approval == "never" {
                return Err(format!(
                    "MCP capability `{}` must require first-use or always approval.",
                    permission.capability_id
                ));
            }
            if !permission.effects.iter().any(|effect| effect == "network") {
                return Err(format!(
                    "MCP capability `{}` must declare its network effect.",
                    permission.capability_id
                ));
            }
        } else {
            return Err(format!(
                "Capability `{}` must be a documented local or MCP capability.",
                permission.capability_id
            ));
        }
    }
    Ok(())
}

fn parse_mcp_capability(capability_id: &str) -> Result<(&str, &str), String> {
    let mut segments = capability_id.splitn(3, '.');
    let prefix = segments.next();
    let server = segments.next().unwrap_or_default();
    let tool = segments.next().unwrap_or_default();
    if prefix != Some("mcp") || !is_entity_id(server) || !is_entity_id(tool) {
        return Err(format!(
            "MCP capability `{capability_id}` must use mcp.<server>.<tool>."
        ));
    }
    Ok((server, tool))
}

fn compile_source(data_dir: &Path, app_id: &str, source: &str) -> Result<String, String> {
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
        if bundle.as_bytes().len() > MAX_BUNDLE_BYTES {
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

fn authoring_record(record: &GeneratedAppRecord) -> Value {
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

#[tauri::command]
pub(crate) async fn invoke_generated_app_capability(
    state: tauri::State<'_, crate::AppState>,
    input: InvokeCapabilityInput,
) -> Result<Value, String> {
    let encoded = serde_json::to_vec(&input.input).map_err(display_error)?;
    if encoded.len() > MAX_CAPABILITY_INPUT_BYTES {
        return Err("Capability input is too large.".to_string());
    }
    let record = read_record(&state.data_dir, &input.app_id)?
        .ok_or_else(|| "Local app was not found.".to_string())?;
    if record.revision != input.revision {
        return Err("The app changed. Reload it before running an action.".to_string());
    }
    let grant = record
        .permissions
        .iter()
        .find(|grant| grant.capability_id == input.capability_id)
        .cloned()
        .ok_or_else(|| "The app is not allowed to use this capability.".to_string())?;
    if grant.approval != "never" && !input.approved {
        return Err("The user did not approve this capability call.".to_string());
    }

    match input.capability_id.as_str() {
        "local.echo" => {
            require_read_only_grant(&grant)?;
            Ok(input.input)
        }
        "local.now" => {
            require_read_only_grant(&grant)?;
            Ok(json!({ "timestampMs": now_ms() }))
        }
        capability if capability.starts_with("mcp.") => {
            if !input.input.is_object() {
                return Err("MCP capability input must be a JSON object.".to_string());
            }
            let (server, tool) = parse_mcp_capability(capability)?;
            let result = crate::codex::mcp::call_mcp_tool(
                &state,
                &record.authoring_thread_id,
                server,
                tool,
                input.input,
            )
            .await?;
            if serde_json::to_vec(&result).map_err(display_error)?.len()
                > MAX_CAPABILITY_OUTPUT_BYTES
            {
                return Err("MCP capability output is too large.".to_string());
            }
            Ok(result)
        }
        _ => Err("The requested capability is not installed in the native host.".to_string()),
    }
}

fn require_read_only_grant(grant: &LocalAppPermission) -> Result<(), String> {
    if grant.effects.as_slice() != ["read"] || grant.approval != "never" {
        return Err(
            "This local capability requires read-only access with no approval.".to_string(),
        );
    }
    Ok(())
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

fn apps_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("apps")
}

fn read_record(data_dir: &Path, app_id: &str) -> Result<Option<GeneratedAppRecord>, String> {
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
    if record.bundle.as_bytes().len() > MAX_BUNDLE_BYTES {
        return Err("Stored local app bundle is too large.".to_string());
    }
    validate_compiled_imports(&record.bundle)?;
    Ok(Some(record))
}

fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(display_error)?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes).map_err(display_error)?;
    fs::rename(temporary, path).map_err(display_error)
}

fn required_string<'a>(value: &'a Value, field: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("`{field}` must be a string."))
}

fn is_entity_id(value: &str) -> bool {
    let mut characters = value.chars();
    characters
        .next()
        .is_some_and(|character| character.is_ascii_lowercase())
        && value.len() <= 80
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_source() -> String {
        r#"import { usePersistentState } from '@y31/local-app';
import { Page, SliderField } from '@y31/local-app/ui';

export default function App() {
  const [value, setValue] = usePersistentState('value', 50);
  return <Page title="Playground"><SliderField label="Value" min={0} max={100} value={value} onChange={setValue} /></Page>;
}"#
            .to_string()
    }

    fn publish_input(expected_revision: u64) -> PublishAppInput {
        PublishAppInput {
            app_id: "playground".to_string(),
            title: "Playground".to_string(),
            description: "A local interactive playground.".to_string(),
            expected_revision,
            source: valid_source(),
            permissions: Vec::new(),
        }
    }

    #[test]
    fn validates_source_imports_and_browser_boundaries() {
        assert!(validate_source(&valid_source()).is_ok());
        assert!(
            validate_source("import x from 'remote'; export default function App() {}").is_err()
        );
        assert!(validate_source("export default function App() { fetch('/secret'); }").is_err());

        let directory = std::env::temp_dir().join(format!(
            "y31-source-import-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let invalid_export = "import { Card } from '@y31/local-app/ui'; export default function App() { return <Card />; }";
        assert!(compile_source(&directory, "invalid-import", invalid_export).is_err());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn publishes_a_flat_dynamic_tool_schema() {
        let publish_tool = dynamic_tool_specs()
            .into_iter()
            .find(|tool| tool.get("name") == Some(&json!("local_app_publish")))
            .unwrap();
        let schema = publish_tool.get("inputSchema").unwrap();
        assert!(schema["properties"]["source"].is_object());
        assert!(schema["properties"].get("properties").is_none());
    }

    #[test]
    fn requires_user_approval_and_network_effects_for_mcp_tools() {
        let mut permission = LocalAppPermission {
            capability_id: "mcp.atlassian.search_issues".to_string(),
            effects: vec!["read".to_string(), "network".to_string()],
            approval: "first-use".to_string(),
        };
        assert!(validate_permissions(std::slice::from_ref(&permission)).is_ok());

        permission.approval = "never".to_string();
        assert!(validate_permissions(std::slice::from_ref(&permission)).is_err());
        permission.approval = "always".to_string();
        permission.effects = vec!["read".to_string()];
        assert!(validate_permissions(std::slice::from_ref(&permission)).is_err());
    }

    #[test]
    fn publishes_compiled_immutable_revisions_owned_by_a_chat() {
        let directory = std::env::temp_dir().join(format!(
            "y31-source-app-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let first = publish_app(&directory, "chat-1", "thread-1", publish_input(0)).unwrap();
        assert_eq!(first.revision, 1);
        assert!(first.bundle.contains("React.createElement"));
        assert!(publish_app(&directory, "chat-2", "thread-2", publish_input(1)).is_err());
        assert!(publish_app(&directory, "chat-1", "thread-1", publish_input(0)).is_err());
        let second = publish_app(&directory, "chat-1", "thread-1", publish_input(1)).unwrap();
        assert_eq!(second.revision, 2);
        assert!(directory.join("apps/playground/versions/1.json").exists());
        assert!(directory.join("apps/playground/versions/2.json").exists());
        let _ = fs::remove_dir_all(directory);
    }
}
