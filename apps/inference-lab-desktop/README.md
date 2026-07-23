# inference-lab-desktop

`inference-lab-desktop` is the native desktop foundation for **y31**.

## Architecture

- The Rust crate manages the local Codex app-server connection, attachment cleanup, and logging.
- The frontend uses four native commands: Codex status, connection, model listing, and streamed text.
- Project generation, generated-app plugins, and inference-service settings are not part of this app.

## Commands

Run commands from the monorepo root:

```sh
bun run inference-lab-desktop:dev
bun run inference-lab-desktop:build
bun run inference-lab-desktop:test
bun run --filter inference-lab-desktop typecheck
bun run --filter inference-lab-desktop test:rust
```
