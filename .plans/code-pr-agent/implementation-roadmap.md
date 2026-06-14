# Code Roadmap

The actionable pre-MVP work packages, completion qualifiers, and automatic stage gates are defined
in [mvp-completion-plan.md](./mvp-completion-plan.md).

## Phase 1: Self-Hardening Local Foundation

- Rewrite the desktop runtime around local repositories, policies, and change sessions.
- Add versioned SQLite persistence and app-managed Git worktrees.
- Use persistent Codex app-server threads with explicit approvals.
- Add localhost-only Playwright tools for agent inspection and interaction.
- Add manifest v2, policy fingerprints, deterministic gates, worktree digests, and safety checks.
- Add unified review, continuation, cancellation, verification, acceptance, and discard workflows.
- Add contract tests, React tests, Rust integration tests, browser tests, and deterministic fixture
  sessions.

## Phase 2: Native And UX Hardening

- Add packaged macOS application automation after the layered E2E suite is stable.
- Expand browser evidence, visual comparison ergonomics, retention, export, and diagnostics.
- Add signed verification images, stronger process isolation, and deeper crash and cancellation tests.
- Add performance budgets, flaky-test handling, and larger real-repository dogfooding.

## Phase 3: Repository Profiles

- Add additional package managers, languages, operating systems, and repository-specific adapters.
- Preserve the same fresh-digest and deterministic-verification contract for every profile.

## Phase 4: Team And Publishing

- Add WorkOS identity, Convex coordination, GitHub Apps, shared repositories, and team queues.
- Synchronize compact metadata while keeping private local evidence opt-in.
- Publish verified branches and pull requests with attached verification summaries.
- Require explicit auditable overrides for any unverified publication.

## Deferred Providers

Codex remains the only MVP implementation provider. Future local, API-funded, or hosted engines must
implement the same session interface and cannot weaken verification, isolation, or approval rules.
