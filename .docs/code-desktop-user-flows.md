# Code Desktop User Flows

Last updated: 2026-06-23

These flows describe the private-beta desktop loop. Screenshots are placeholders until the app is
explicitly run for visual capture.

## First Run And Setup

```text
[Launch Code]
      |
      v
[Setup check]
  - Codex available
  - Codex authenticated
  - Docker verifier ready
      |
      +-- missing prerequisite --> [Setup action] --> [Check again]
      |
      v
[Open repository]
```

Screenshot placeholders:

- `setup-ready`: setup page with all checks ready.
- `setup-missing-docker`: setup page with verifier build action.
- `setup-missing-codex-login`: setup page with Codex login action.

## Repository Scan And Target Curation

```text
[Open local repo]
      |
      v
[Deterministic metadata scan]
  - root package.json
  - workspace package.json files
  - scripts and app configs
      |
      v
[Repository map]
  - proposed apps/packages
  - selected checkboxes
  - manual target add
      |
      v
[Save map]
      |
      v
[Repo / target picker]
```

Screenshot placeholders:

- `repo-map-proposed`: repository page after first scan.
- `repo-map-manual-target`: manual target form filled.
- `repo-target-picker`: dropdown grouping targets under repositories.

## Policy Approval

```text
[Selected target]
      |
      v
[Propose policy]
      |
      v
[Readable gate summary]
  - install
  - typecheck/lint/build/test gates
  - app server config when needed
      |
      +-- expert review --> [Technical details: fingerprint + raw manifest]
      |
      v
[Approve policy]
```

Screenshot placeholders:

- `policy-summary`: readable required gates.
- `policy-technical-details`: expanded manifest and fingerprint.
- `policy-approved`: approved/current policy state.

## Change Session

```text
[Selected repo / target]
      |
      v
[Start change]
      |
      v
[Agent works in app-managed worktree]
      |
      +-- approval requested --> [Allow once / Allow session / Decline]
      |
      v
[Verification]
      |
      +-- failed --> [Repair turn] --> [Verification]
      |
      +-- needs input --> [Continue with guidance] or [Verify current tree]
      |
      v
[Verified]
```

Screenshot placeholders:

- `session-active`: implementing or verifying session.
- `session-approval`: pending approval row.
- `session-needs-input`: continue session form.
- `session-verified`: verified state with actions.

## Evidence And Acceptance

```text
[Verified session]
      |
      +-- stale worktree --> [Verify again required]
      |
      v
[Export report]
      |
      v
[Artifacts]
  - Evidence report (Markdown)
  - Evidence report (JSON)
  - logs/screenshots/traces/assertions
      |
      v
[Accept branch]
      |
      v
[Local branch ready]
```

Screenshot placeholders:

- `verification-summary`: passed checks without digest noise.
- `report-artifacts`: report artifacts listed first enough to find.
- `report-preview`: Markdown report preview.
- `accepted-branch`: accepted final state.

## Failure Recovery

```text
[Interrupted / failed / cancelled]
      |
      +-- worktree exists --> [Continue] or [Verify again] or [Discard]
      |
      +-- worktree missing --> [Discard]
      |
      v
[Final state]
  - accepted
  - discarded
```

Screenshot placeholders:

- `stale-verification`: acceptance blocked until verify again.
- `discard-confirmation`: destructive discard confirmation.
- `final-discarded`: discarded session state.
