---
name: flowguard-impact-review
description: Use when reviewing code changes against Flowguard, reading approved workflow contracts, identifying impacted user behavior, or writing proposal files for review by the Flowguard VS Code extension.
---

# Flowguard Impact Review

Use this skill when a user asks Codex to maintain Flowguard workflow contracts for a code change.

## Core Rules

- Approved files under `.flowguard/flows/` are canonical workflow contracts.
- Do not edit approved Flowguard contract files directly.
- Generated behavior changes must be written only as proposal files under `.flowguard/proposals/`.
- Do not accept or reject proposals. The VS Code extension owns explicit proposal decisions.
- Keep source paths repository-relative POSIX paths without `..`.
- Mark uncertainty in proposal reasons instead of presenting weak inference as fact.

## Workflow

1. Use `flowguard_list_approved_flows` to inspect available approved workflow contracts and current digests.
2. Use `flowguard_read_approved_flow` for any workflow that may be affected by the code change.
3. Compare the user-visible behavior change with the approved states and transitions.
4. If behavior changed, write a version `1` proposal with `flowguard_write_proposal`.
5. Set `baseDigest` to the current digest returned by the read/list tools.
6. Include operation reasons that explain the product behavior delta, not implementation mechanics.

## Proposal Boundaries

Use operations only for semantic behavior:

- `addState` for a new user-visible page, dialog, panel, system state, or terminal state.
- `addTransition` for a new meaningful user, system, or external behavior.
- `updateState` or `updateTransition` for changed labels, routes, sources, tags, action, condition, or outcome.
- `removeState` or `removeTransition` only when behavior is intentionally removed.
- `updateFlow` only for metadata or entry-state changes.

Do not model low-value mechanics such as hover, focus, animation frames, or every keystroke unless
they materially alter observable behavior.

## Safety Checks

Before writing a proposal:

- Confirm the target flow exists.
- Confirm the proposal `baseDigest` matches the approved Flowguard contract digest.
- Prefer one proposal per bounded flow change.
- Keep proposal IDs filename-safe because the MCP server derives the proposal filename from `id`.
