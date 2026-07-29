pub(crate) mod capabilities;
mod catalog;
mod publishing;
mod runtime;
pub(crate) mod store;
mod types;

pub(crate) use catalog::dynamic_tool_specs;
pub(crate) use runtime::AppToolRuntime;

use std::time::{SystemTime, UNIX_EPOCH};

pub(super) fn is_entity_id(value: &str) -> bool {
    let mut characters = value.chars();
    characters
        .next()
        .is_some_and(|character| character.is_ascii_lowercase())
        && value.len() <= 80
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

pub(super) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub(super) fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests;
