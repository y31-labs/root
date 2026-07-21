# inference-lab-desktop

`inference-lab-desktop` is the native desktop foundation for **y31**.

## Architecture

- The Rust crate only starts the Tauri application.
- There are no native commands, managed state, persistence, or network clients yet.
- Features can be added to the native boundary as their requirements become clear.

## Commands

Run commands from the monorepo root:

```sh
bun run inference-lab-desktop:dev
bun run inference-lab-desktop:build
bun run inference-lab-desktop:test
bun run --filter inference-lab-desktop typecheck
bun run --filter inference-lab-desktop test:rust
```
