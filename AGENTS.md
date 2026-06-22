# Agent Instructions

Always try to keep changes minimal and focused.

Never run application unless user explicitly asks for it.

If you need additional information about library use context7.

## Package Manager

Always use `bun` and `bunx` for running commands.
Never use `npm`, `npx`, `yarn`, or `pnpm`.

## Packages and code conventions

When adding a workspace package under `packages/`, follow [.docs/package-creation.md](.docs/package-creation.md).

For import aliases and related rules (`#` inside packages, `@workspace/`, third-party imports), see [.docs/code-conventions.md](.docs/code-conventions.md).

## Code Style

Prefer arrow functions over function expressions and function declarations.

For React function components, use function declarations and named exports:
`export function MyComponent() { ... }`.

Always try to DRY repeating code.

## UI Components

All shared UI primitives and shadcn-generated components live in [`packages/ui`](packages/ui) and are consumed as `@workspace/ui`. Do not add or maintain parallel design-system trees (for example `apps/*/src/components/ui/`) for the same role—extend or compose the shared package instead.

**Do not modify files under `packages/ui/src/components/ui/`** or other vendored UI directories under `packages/ui` except through the intended tooling—these are library-style components from shadcn/ui and should be treated as read-only.

If you need custom behavior, create a wrapper component in the consuming app (or another package) instead of editing the primitives in `packages/ui`.

Add new shadcn components with `bun run ui:add <component>` from the monorepo root or from [`packages/ui`](packages/ui).

## AI Library

Use `@tanstack/ai` for the AI library.

## Convex

Assume Convex codegen stays in sync while `bun run code:convex` or `bun run trading:convex` runs from the monorepo root (each resolves the matching app’s `convex/` folder).

## UI / Theming

Do not introduce raw Tailwind color classes (e.g. `emerald-500`, `red-500`, `green-400`) in app code under `src/`. Use semantic tokens from the theme: `background`, `foreground`, `primary`, `muted`, `success`, `warning`, `danger`, `destructive`, etc.

See [.docs/ui-theming.md](.docs/ui-theming.md) for the full token reference, signal-to-token mapping (bullish→success, bearish→danger), radius scale, and the recipe for adding new tokens.

Code desktop runtime storage, cleanup, verifier image, and distribution rules are documented in
[.docs/code-desktop-runtime.md](.docs/code-desktop-runtime.md).

For the Code desktop app and shared workbench surfaces, follow
[.docs/code-ui-style.md](.docs/code-ui-style.md). The default visual direction is minimal and
flat: do not use cards for page layout.
