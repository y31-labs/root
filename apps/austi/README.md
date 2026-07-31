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
`release-austi` branch, the release workflow publishes the DMG, macOS updater archive, signature, and
`latest.json`. Publishing the GitHub Release makes the update available to installed copies of
Austi.

For the normal release path, open **Actions → Release Austi → Run workflow**, choose a patch,
minor, or major version update, and run it. The workflow merges `main` into `release-austi`, updates
the version in the Tauri config, Cargo manifest, and lockfile, validates and tests the result,
commits the release version, creates the matching `austi-v<version>` tag, and publishes the release.
Choose `keep` only to retry publishing the current version after a failed release attempt.

The workflow maintains the dedicated `release-austi` branch so desktop releases remain independent
from the website release branches. Pushing an already-versioned change to `release-austi` also
publishes it automatically. See [release branch conventions](../../.docs/release-branches.md) for
the repository-wide branch map.

The repository requires `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Actions secrets. Keep an offline backup of both values: losing
them prevents future updates to existing installations. Apple Developer ID signing and notarization
can be added independently when distributing beyond development machines.
