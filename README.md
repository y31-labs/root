# Root Monorepo

This repository is a Bun workspace for the Code, Trading, Portfolio, and Flowguard projects.

## Workspace Map

- `apps/code`: TanStack Start web app backed by the root Convex app in `convex/`.
- `apps/code-desktop`: Tauri desktop app with Vite UI, Rust local runtime, Playwright coverage, and verifier packaging.
- `apps/trading`: TanStack Start trading app with its own Convex app under `apps/trading/convex`.
- `apps/portfolio`: Astro portfolio site.
- `apps/flowguard-vscode`: Flowguard VS Code extension, webview, fixtures, and tests.
- `packages/ui`: Shared shadcn/Tailwind UI primitives and app-level UI helpers.
- `packages/web-foundation`: Shared TanStack Start, Vite, WorkOS, and Convex helpers.
- `packages/code-workbench`: Shared Code workbench React components.
- `packages/code-agent-contracts`: Shared Code domain contracts.
- `packages/flowguard-contracts`: Pure Flowguard document contracts and validation.
- `packages/flowguard-engine`: Pure Flowguard graph, impact, and layout helpers.
- `scripts`: Code MVP smoke runner, report verifier, and demo repository tooling.
- `plugins/flowguard-codex`: Local Codex plugin and Flowguard review skill.

## Common Commands

Use Bun from the repository root:

```sh
bun install
bun run lint
bun run typecheck
bun run test
bun run check
```

Product-specific commands:

```sh
bun run code:check
bun run code:verify
bun run flowguard:check
bun run trading:test
bun run portfolio:build
```

Formatting is available as an explicit command and is not part of `check`:

```sh
bun run format
```

## Conventions

- Follow `AGENTS.md` for repository-wide agent instructions.
- Use `bun` and `bunx`; do not use `npm`, `npx`, `yarn`, or `pnpm`.
- New packages under `packages/` should follow `.docs/package-creation.md`.
- Import aliases and package import rules are documented in `.docs/code-conventions.md`.
- Theming and UI rules live in `.docs/ui-theming.md` and `.docs/code-ui-style.md`.
- Code desktop runtime, verifier image, cleanup, and distribution details live in `.docs/code-desktop-runtime.md`.
