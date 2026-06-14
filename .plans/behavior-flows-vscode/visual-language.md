# Behavior Flows Visual Language

## Objective

The graph should answer three questions quickly:

1. Where can the user be?
2. What can move them to another meaningful state?
3. What behavior changed in the current proposal?

The visualization is a review tool, not a decorative process diagram.

## Canvas Structure

- Lay out the primary journey from left to right.
- Place alternative, error, and recovery branches below the primary path.
- Keep terminal outcomes visually distinct.
- Avoid crossing edges where the layout engine can reasonably prevent them.
- Fit the selected flow on first open while preserving manual zoom afterward.

## Nodes

Node content:

```text
[kind icon] State name
route, when present
short description, when space permits
```

Node kinds:

- `page`: full navigable surface;
- `dialog`: modal interaction state;
- `panel`: meaningful state within a page;
- `system`: processing or system-controlled state;
- `terminal`: success, failure, cancellation, or another flow outcome.

Do not use separate colors to encode every node kind. Prefer shape, icon, label, and restrained
semantic accents.

## Edges

An edge label begins with the actor when ambiguity exists:

```text
User: Submit valid credentials
System: Authentication succeeds
External: Payment provider rejects charge
```

Conditions and outcomes belong in the inspector rather than on the canvas unless they are short and
essential to distinguish branches.

## Diff Semantics

- `unchanged`: normal theme treatment;
- `added`: semantic success treatment;
- `modified`: semantic warning treatment;
- `removed`: semantic danger treatment with reduced opacity;
- `uncertain`: dashed outline or edge plus an explicit uncertainty label;
- `invalid`: destructive indicator and diagnostic icon.

Never rely on color alone. Every changed item also needs an icon, line style, badge, or text label.

## Selection Inspector

Selecting a node or edge opens an inspector that shows:

- semantic ID;
- description;
- route;
- action, actor, condition, and outcome;
- source references;
- proposal reason;
- confidence or uncertainty;
- validation issues.

Source references are clickable and open the file in VS Code.

## Proposal Review

The default proposal view overlays approved and proposed behavior in one graph. It also provides a
linear change list for accessibility and precise review.

Decision controls apply to the proposal as a whole in the MVP:

- Accept proposal
- Reject proposal
- Open proposal JSON

Per-operation acceptance is deferred because it introduces ordering and conflict complexity.

## Large Graphs

The MVP should optimize for flows with roughly 3 to 30 states. For larger flows:

- show a warning that the flow may be too broad;
- support search and focus-selection;
- allow fit-to-view;
- avoid adding minimaps or grouping until real usage demonstrates the need.

Do not solve whole-product visualization in the first release.

## Accessibility

- Every graph item must have an equivalent entry in a keyboard-accessible change or item list.
- Selection must be synchronized between graph and list.
- Focus indicators must use VS Code theme variables.
- Tooltips cannot contain required information unavailable elsewhere.
- The graph must remain understandable under common color-vision deficiencies.

## Theming

Use VS Code theme variables inside the webview. Do not hardcode light or dark palettes. Keep the
surface flat and minimal; hierarchy should come from typography, spacing, dividers, and selection.

The extension may compose shared workspace UI utilities where they fit, but it must not create a
second general-purpose design-system tree.

