# Agent Instructions

Always try to keep changes minimal and focused.

Never run application unless user explicitly asks for it.

If you need additional information about library use context7.

## Package Manager

Always use `bun` and `bunx` for running commands.
Never use `npm`, `npx`, `yarn`, or `pnpm`.

## UI Components

**Do not modify files in `src/components/ui/` and `src/components/ai-elements/`** - these are library components from shadcn/ui and should be treated as read-only.

If you need custom behavior, create a wrapper component elsewhere instead of editing the UI primitives.

You can add new components with `bunx shadcn@latest add <component>`.

## AI Library

Use `@tanstack/ai` for the AI library.

## Convex

Assume that all code gets generated automatically as `bunx convex dev` runs in the background.

## UI / Theming

Do not introduce raw Tailwind color classes (e.g. `emerald-500`, `red-500`, `green-400`) in app code under `src/`. Use semantic tokens from the theme: `background`, `foreground`, `primary`, `muted`, `success`, `warning`, `danger`, `destructive`, etc.

See [docs/ui-theming.md](docs/ui-theming.md) for the full token reference, signal-to-token mapping (bullish→success, bearish→danger), radius scale, and the recipe for adding new tokens.
