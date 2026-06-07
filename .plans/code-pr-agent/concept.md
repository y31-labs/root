# Local Self-Verifying Code Agent

## Vision

Code Desktop is a macOS-first development workbench that uses the developer's installed Codex CLI and
existing ChatGPT login. Codex may implement and repair a task, but only deterministic Docker gates can
mark the result verified.

## Core Loop

1. The user connects GitHub and approves a Bun verification manifest for an exact commit.
2. Desktop creates a task through Convex and clones that commit into app-managed storage.
3. `codex exec --json --ephemeral --sandbox workspace-write` edits the disposable checkout.
4. Desktop streams Codex JSONL into a local SQLite timeline.
5. Every required manifest gate runs independently in the pinned Docker image.
6. Failed diagnostics may start a new Codex repair turn, up to five attempts and 30 minutes.
7. Desktop creates a patch and retains logs, screenshots, assertions, and traces locally.
8. Convex receives only the compact lifecycle and gate summary.

## Product Pillars

- **Proof before completion:** a model cannot override a failed or missing required gate.
- **Local subscription use:** the product invokes the official CLI and never reads Codex credentials.
- **Stable execution:** exact SHAs, argument-array commands, a pinned image, timeouts, and bounded repair.
- **Private evidence:** paths, patches, logs, screenshots, and traces remain on the developer's Mac.
- **Small shared control plane:** account, repository policy, tasks, and summaries sync through Convex.

GitHub branch and pull-request publishing follows this milestone and consumes verified local patches.
