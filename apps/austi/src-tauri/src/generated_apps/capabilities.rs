use std::collections::HashSet;

use serde_json::{json, Value};

use super::{
    display_error, is_entity_id, now_ms,
    store::read_record,
    types::{InvokeCapabilityInput, LocalAppPermission},
};

const MAX_CAPABILITY_INPUT_BYTES: usize = 32 * 1024;
const MAX_CAPABILITY_OUTPUT_BYTES: usize = 1024 * 1024;

pub(super) fn validate_permissions(permissions: &[LocalAppPermission]) -> Result<(), String> {
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
