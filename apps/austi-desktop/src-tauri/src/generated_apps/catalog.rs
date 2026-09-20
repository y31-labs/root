use serde_json::{json, Value};

pub(super) const ALLOWED_IMPORTS: [&str; 4] = [
    "react",
    "@y31/local-app",
    "@y31/local-app/ui",
    "@y31/local-app/icons",
];
pub(super) const REACT_EXPORTS: [&str; 15] = [
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
pub(super) const SDK_EXPORTS: [&str; 3] = ["useAppInfo", "useCapability", "usePersistentState"];
pub(super) const UI_EXPORTS: [&str; 20] = [
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
pub(super) const ICON_EXPORTS: [&str; 25] = [
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

pub(super) fn catalog_result() -> Value {
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
