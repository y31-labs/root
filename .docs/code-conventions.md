# Code conventions

Shared conventions for code in this monorepo. More sections can be added here over time.

## Package internal imports

These rules apply to source under `packages/<name>/src/`. Apps under `apps/` may use different path aliases; follow each app’s `tsconfig` / Vite config.

Inside a package, always import internal modules via the `#` alias. Do not use relative imports like `../` or `./` for cross-file imports within the same package.

Define the alias in `package.json#imports`:

```json
{
  "imports": {
    "#/*": "./src/*.ts"
  }
}
```

### Import style

- Internal package imports: `#/...`
- Other workspace packages: `@workspace/...`
- Third-party packages: bare package name

Examples:

```ts
import { validateInput } from "#/validation";
import type { Profile } from "#/types";
import { Button } from "@workspace/ui/button";
import { z } from "zod";
```

### Summary

Within package files under `packages/`, always use `#` alias imports for internal modules.
