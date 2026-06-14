# Behavior Flows for VS Code

This directory is the implementation brief for a VS Code extension that keeps a visual,
version-controlled model of product behavior beside the code.

## Product Thesis

The extension shows approved user flows as graphs and helps Codex propose flow changes when
application behavior changes. The developer reviews code changes and behavior changes separately.
Approved flow files are committed to Git and may become executable E2E specifications later.

## Canonical Documents

- [concept.md](./concept.md): problem, users, principles, and product boundaries.
- [mvp.md](./mvp.md): exact first release and completion criteria.
- [architecture.md](./architecture.md): package boundaries and VS Code integration.
- [contracts.md](./contracts.md): repository files, entities, validation, and proposal format.
- [visual-language.md](./visual-language.md): graph semantics and interaction rules.
- [implementation-roadmap.md](./implementation-roadmap.md): staged delivery plan.
- [agent-work-packages.md](./agent-work-packages.md): agent-sized tasks, dependencies, and ownership.

## Working Name

Use `Behavior Flows` in user-facing copy and `behavior-flows` in package, command, and directory
names until branding is decided.

## Proposed Repository Shape

```text
apps/
  behavior-flows-vscode/
packages/
  behavior-flow-contracts/
  behavior-flow-engine/
plugins/
  behavior-flows-codex/        # Post-core integration
```

Do not place flow-domain code inside the extension host. The schema and graph projection must remain
usable from a web application, Codex plugin, CLI, or future test runner.

## Execution Rules

1. Complete the scaffold work package before parallel implementation begins.
2. Agents should claim only one work package and stay inside its ownership boundary.
3. Approved behavior and generated proposals must remain distinct.
4. No model-generated proposal may modify approved flow files without explicit user action.
5. Use `bun` and `bunx` for every package and verification command.
6. Do not add E2E execution, browser recording, or automatic test generation during the MVP.

## First Demonstration

The first useful demonstration is:

1. Open a repository containing `.product-flows/flows/login.json`.
2. Select `Login` from the VS Code sidebar.
3. View the flow as a graph in an editor tab.
4. Load a proposed change that adds a password-reset state and transition.
5. Review approved and proposed behavior together.
6. Accept the proposal and produce a normal text-file Git diff.

