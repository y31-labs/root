use serde_json::Value;

use super::super::super::types::CodexActivityItem;

const ACTIVITY_DETAIL_LIMIT: usize = 50_000;

pub(super) fn command_detail(item: &Value) -> Option<String> {
    let mut sections = Vec::new();
    if let Some(command) = item
        .get("command")
        .and_then(Value::as_str)
        .filter(|command| !command.trim().is_empty())
    {
        sections.push(format!("Command\n{}", bounded_detail(command)));
    }
    if let Some(output) = item
        .get("aggregatedOutput")
        .and_then(Value::as_str)
        .filter(|output| !output.is_empty())
    {
        sections.push(format!("Output\n{}", bounded_detail(output)));
    }
    (!sections.is_empty()).then(|| bounded_detail(&sections.join("\n\n")))
}

pub(super) fn display_path(path: &str) -> String {
    path.trim_matches(|character| matches!(character, '\'' | '"' | '`' | ',' | ';'))
        .trim_end_matches(':')
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("file")
        .to_string()
}

fn shorten(value: &str, max_characters: usize) -> String {
    let mut characters = value.chars();
    let shortened = characters.by_ref().take(max_characters).collect::<String>();
    if characters.next().is_some() {
        format!("{shortened}…")
    } else {
        shortened
    }
}

pub(super) fn bounded_detail(value: &str) -> String {
    shorten(value, ACTIVITY_DETAIL_LIMIT)
}

pub(super) fn format_duration_ms(duration_ms: u64) -> String {
    if duration_ms < 1_000 {
        return format!("{duration_ms} ms");
    }
    let seconds = duration_ms / 1_000;
    if seconds < 60 {
        return format!("{seconds}s");
    }
    format!("{}m {}s", seconds / 60, seconds % 60)
}

pub(super) fn file_change_items(
    item: &Value,
    item_id: &str,
    completed: bool,
) -> Option<Vec<CodexActivityItem>> {
    let items = item
        .get("changes")?
        .as_array()?
        .iter()
        .enumerate()
        .filter_map(|(index, change)| {
            let path = change.get("path")?.as_str()?;
            let kind = change
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("update");
            let diff = change
                .get("diff")
                .and_then(Value::as_str)
                .filter(|diff| !diff.is_empty());
            let (additions, deletions) = diff.map(diff_line_counts).unwrap_or_default();
            let action = match (kind, completed) {
                ("add", true) => "Created",
                ("add", false) => "Creating",
                ("delete", true) => "Deleted",
                ("delete", false) => "Deleting",
                (_, true) => "Edited",
                (_, false) => "Editing",
            };
            let counts = if additions > 0 || deletions > 0 {
                format!(" +{additions} -{deletions}")
            } else {
                String::new()
            };
            Some(CodexActivityItem {
                id: format!("{item_id}-change-{index}"),
                label: format!("{action} {}{counts}", display_path(path)),
                detail: diff.map(bounded_detail),
            })
        })
        .collect::<Vec<_>>();
    (!items.is_empty()).then_some(items)
}

fn diff_line_counts(diff: &str) -> (usize, usize) {
    diff.lines().fold((0, 0), |(additions, deletions), line| {
        if line.starts_with('+') && !line.starts_with("+++") {
            (additions + 1, deletions)
        } else if line.starts_with('-') && !line.starts_with("---") {
            (additions, deletions + 1)
        } else {
            (additions, deletions)
        }
    })
}

pub(super) fn tool_detail(item: &Value, input_key: &str, output_keys: &[&str]) -> Option<String> {
    let mut sections = Vec::new();
    if let Some(input) = pretty_json(item.get(input_key)) {
        sections.push(format!("Input\n{input}"));
    }
    for output_key in output_keys {
        if let Some(output) = pretty_json(item.get(*output_key)) {
            sections.push(format!("Output\n{output}"));
        }
    }
    (!sections.is_empty()).then(|| bounded_detail(&sections.join("\n\n")))
}

pub(super) fn pretty_json(value: Option<&Value>) -> Option<String> {
    let value = value.filter(|value| !value.is_null())?;
    if let Some(value) = value.as_str() {
        return (!value.is_empty()).then(|| bounded_detail(value));
    }
    serde_json::to_string_pretty(value)
        .ok()
        .map(|value| bounded_detail(&value))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn shortens_by_characters_without_splitting_unicode() {
        assert_eq!(shorten("aé🙂z", 3), "aé🙂…");
        assert_eq!(shorten("aé🙂", 3), "aé🙂");
    }

    #[test]
    fn counts_changed_lines_without_counting_diff_headers() {
        let diff = "--- a/src/app.tsx\n+++ b/src/app.tsx\n@@ -1 +1,2 @@\n-old\n+new\n+added\n";

        assert_eq!(diff_line_counts(diff), (2, 1));
    }

    #[test]
    fn formats_activity_durations() {
        assert_eq!(format_duration_ms(500), "500 ms");
        assert_eq!(format_duration_ms(12_500), "12s");
        assert_eq!(format_duration_ms(125_000), "2m 5s");
    }

    #[test]
    fn creates_file_change_details_with_stable_ids_and_counts() {
        let item = json!({
            "changes": [
                {
                    "path": "src/app.tsx",
                    "kind": "update",
                    "diff": "--- a/src/app.tsx\n+++ b/src/app.tsx\n-old\n+new\n"
                },
                { "path": "src/new.ts", "kind": "add" }
            ]
        });

        let items =
            serde_json::to_value(file_change_items(&item, "file-1", true).unwrap()).unwrap();
        assert_eq!(
            items,
            json!([
                {
                    "id": "file-1-change-0",
                    "label": "Edited app.tsx +1 -1",
                    "detail": "--- a/src/app.tsx\n+++ b/src/app.tsx\n-old\n+new\n"
                },
                {
                    "id": "file-1-change-1",
                    "label": "Created new.ts"
                }
            ])
        );
    }

    #[test]
    fn bounds_the_combined_tool_detail() {
        let item = json!({
            "arguments": "a".repeat(30_000),
            "result": "b".repeat(30_000)
        });

        let detail = tool_detail(&item, "arguments", &["result"]).unwrap();
        assert_eq!(detail.chars().count(), ACTIVITY_DETAIL_LIMIT + 1);
        assert!(detail.ends_with('…'));
    }
}
