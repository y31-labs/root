# Austi

`austi` is the native desktop foundation for **Austi**.

## Architecture

- The Rust crate manages the local Codex app-server connection, attachment cleanup, logging, and
  compiled local React app persistence.
- The frontend uses native commands for Codex status, connection, model listing, streamed text,
  and approval responses.
- Chats can publish local React apps through Codex dynamic tools using a small SDK of shared UI
  imports and host hooks. The native host compiles and validates source, owns capability and MCP
  authorization, and runs generated code inside a network-disabled sandboxed frame.

## Commands

Run commands from the monorepo root:

```sh
bun run austi:dev
bun run austi:build
bun run austi:test
bun run --filter austi typecheck
bun run --filter austi test:rust
```
