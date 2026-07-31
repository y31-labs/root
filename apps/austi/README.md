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

## Releases and updates

Austi uses Tauri's signed updater with GitHub Releases. When Austi-related changes reach the
`release` branch, the release workflow publishes the DMG, macOS updater archive, signature, and
`latest.json`. Publishing the GitHub Release makes the update available to installed copies of
Austi.

Before releasing, update the version in both `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`. Then promote the change to the `release` branch. The workflow validates
that both version values match, creates the matching `austi-v<version>` tag, and publishes the
release automatically. It can also be run manually from GitHub Actions.

The repository requires `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Actions secrets. Keep an offline backup of both values: losing
them prevents future updates to existing installations. Apple Developer ID signing and notarization
can be added independently when distributing beyond development machines.
