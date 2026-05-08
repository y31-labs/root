# How to Create a New Package

This guide defines the standard way to add a new package under `packages/`.

## 1) Create the folder structure

Create:

- `packages/<name>/package.json`
- `packages/<name>/tsconfig.json`
- `packages/<name>/src/index.ts`

Optional:

- `packages/<name>/src/*.test.ts`
- `packages/<name>/README.md`

## 2) Configure `package.json`

Use workspace naming and ESM exports:

```json
{
  "name": "@workspace/<name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./*": "./src/*.ts"
  }
}
```

If the package has tests/typecheck scripts, use `bun` / `bunx`.

## 3) Configure internal alias imports (required)

Inside package source files, always import internal modules via the `#` alias.

Do not use relative imports like `../` or `./` for cross-file package imports.

Define aliases in `package.json#imports`:

```json
{
  "imports": {
    "#/*": "./src/*.ts"
  }
}
```

### `tsconfig.json` example

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "esnext",
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["src/**/*.ts"]
}
```

## 4) Import style conventions (required)

- Internal package imports: `#/...`
- External workspace imports: `@workspace/...`
- Third-party imports: package name

Examples:

```ts
import { validateInput } from "#/validation";
import type { Profile } from "#/types";
import { Button } from "@workspace/ui/button";
import { z } from "zod";
```

## 5) Export from `src/index.ts`

The package should have a stable public API and re-export public modules from `src/index.ts`.

Example:

```ts
export * from "#/types";
export * from "#/services";
```

## 6) Verification checklist

- Package compiles with `bunx tsc --noEmit`
- Tests pass with `bun test` (if tests exist)
- No lint/type errors in new package files
- Internal imports use `#` alias consistently

## Summary rule

Within package files, always use `#` alias imports for internal modules.
