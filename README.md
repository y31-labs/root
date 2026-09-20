# Root Monorepo

This repository is a Bun workspace for the Austi, Code, Trading, and Portfolio projects.

## Workspace Map

- `apps/code`: TanStack Start web app backed by the root Convex app in `convex/`.
- `apps/code-desktop`: Tauri desktop app with Vite UI, Rust local runtime, Playwright coverage, and verifier packaging.
- `apps/austi-desktop`: Tauri desktop app for experimenting with local Codex inference workflows.
- `apps/austi-landing`: Astro marketing site for Austi.
- `apps/trading`: TanStack Start trading app with its own Convex app under `apps/trading/convex`.
- `apps/portfolio`: Astro portfolio site.
- `packages/ui`: Shared shadcn/Tailwind UI primitives and app-level UI helpers.
- `packages/web-foundation`: Shared TanStack Start, Vite, WorkOS, and Convex helpers.
- `packages/code-workbench`: Shared Code workbench React components.
- `packages/code-agent-contracts`: Shared Code domain contracts.
- `scripts`: Code MVP smoke runner, report verifier, and demo repository tooling.

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
bun run code:dev
bun run desktop:dev
bun run austi-desktop:dev
bun run austi-landing:dev
bun run trading:dev
bun run portfolio:dev

bun run code:check
bun run code:verify
bun run trading:test
bun run portfolio:build
bun run austi-landing:build
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
- Production branch naming and promotion rules live in `.docs/release-branches.md`.
