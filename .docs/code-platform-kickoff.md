# Code Platform Kickoff

Last updated: 2026-06-23

This document turns the platform strategy into the first operating cycle. It assumes the product
direction in `.docs/code-platform-strategy.md`.

## Kickoff Goal

In the first 30 days, prove whether developers will install Code, run it on a real repository, and
accept an AI-generated branch because the evidence is strong enough to trust.

The kickoff is successful if:

- The MVP scope is frozen.
- A private beta cohort is recruited.
- The first-run verified branch flow is demoable.
- At least 10 real users are scheduled for pilots.
- At least 5 real repositories complete a session.
- At least 3 users say they would pay for the workflow.

## Operating Principles

- Keep the wedge narrow: local verified branches for real repos.
- Sell proof, not magic.
- Prefer bounded tasks over broad autonomy.
- Measure accepted branches, not generated code.
- Treat every failed gate as product feedback.
- Keep web as the control plane, not the first value engine.
- Do not add platform breadth before the desktop loop is loved.

## Roles

Use these roles even if one person owns several of them.

| Role | Primary responsibility |
| --- | --- |
| Product lead | Customer discovery, MVP scope, positioning, pricing signal |
| Engineering lead | Desktop loop, verifier, reports, GitHub handoff, release quality |
| Design lead | First-run flow, landing page, evidence report readability |
| Growth lead | Waitlist, launch content, community distribution |
| Pilot lead | Recruiting, scheduling, notes, follow-up, beta support |

## Week 0 Kickoff Agenda

Duration: 90 minutes.

1. Re-state thesis.
   - Code is a verified AI change platform.
   - The first value loop is task to verified branch.

2. Freeze MVP boundaries.
   - Apple Silicon macOS.
   - Bun TypeScript repositories.
   - Local execution.
   - Codex engine.
   - GitHub PR helper only if it does not delay verified branch loop.

3. Pick target pilot tasks.
   - Fix failing test.
   - Add missing test coverage.
   - Repair lint/typecheck/build.
   - Small UI fix with screenshot.
   - Dependency upgrade with tests.

4. Pick beta audience.
   - Technical founders.
   - Senior engineers.
   - Agencies.
   - Small AI-forward product teams.

5. Assign first sprint.
   - Product discovery.
   - First-run UX.
   - Evidence report.
   - Landing page.
   - Demo repo.
   - Beta recruiting.

6. Agree metrics.
   - Install to first repo opened.
   - Repo opened to policy approved.
   - Policy approved to session started.
   - Session started to verified.
   - Verified to accepted branch.
   - Accepted branch to PR/report.

## First 30 Days

### Week 1: Alignment And Discovery Setup

Product:

- Finalize interview script.
- Create pilot target list.
- Define task taxonomy.
- Draft pricing questions.

Engineering:

- Audit current verified branch flow.
- Identify blockers to first-run success.
- Define evidence report schema.
- Select sample repo.

Design:

- Draft landing page wireframe.
- Draft evidence report layout.
- Draft first-run onboarding flow.

Growth:

- Draft waitlist page copy.
- Draft founder-led launch narrative.
- Prepare outreach messages.

Deliverables:

- Interview script.
- Pilot list.
- Demo repo selected.
- Landing page copy v1.
- Sprint backlog.

### Week 2: First User Conversations

Product:

- Run 15 interviews.
- Rank task types by pain, frequency, and verifiability.
- Capture exact language users use for trust, fear, and review burden.

Engineering:

- Implement or polish the smallest blockers found in Week 1.
- Prepare evidence report v1.
- Add a sample verified session artifact if needed.

Design:

- Prototype first-run path.
- Prototype report view/export.

Growth:

- Build waitlist distribution list.
- Draft first technical blog post.

Deliverables:

- Discovery summary.
- Evidence report v1.
- First-run UX plan.
- Waitlist draft.

### Week 3: Concierge Pilots

Product:

- Run 5 pilot sessions.
- Sit with users and observe every point of confusion.
- Track trust objections.

Engineering:

- Fix pilot blockers.
- Improve failure messages for common gate failures.
- Add or refine report export.

Design:

- Tighten report readability.
- Tighten onboarding copy.

Growth:

- Convert pilot findings into launch story.
- Capture anonymized screenshots and proof points.

Deliverables:

- 5 completed pilots.
- Failure taxonomy v1.
- Report export v1.
- Landing page ready for private waitlist.

### Week 4: Beta Readiness

Product:

- Run 5 more pilots.
- Decide beta go/no-go.
- Define Pro and Team packaging.

Engineering:

- Package beta build.
- Verify install docs.
- Add product analytics for core funnel events.
- Prepare GitHub PR helper if already low-risk.

Design:

- Finalize landing page.
- Finalize onboarding.

Growth:

- Open private waitlist.
- Publish first technical post.
- Schedule public demo recording.

Deliverables:

- Private beta package.
- Install docs.
- Landing page.
- 10 total pilots.
- Beta cohort list.

## First Sprint Backlog

### Product

- Write interview script.
- Build list of 50 pilot prospects.
- Create pilot tracking sheet.
- Define the five target task categories.
- Draft MVP one-pager.
- Draft pricing test.

### Engineering

- Verify current end-to-end desktop flow manually on a sample repo.
- Create sample repo and sample task.
- Add evidence report export plan.
- Identify top onboarding failure points.
- Review analytics event allowlist.
- Draft GitHub PR helper technical approach.

### Design

- Draft landing page.
- Draft first-run onboarding.
- Draft evidence report view.
- Draft empty and failure states for first-time users.

### Growth

- Draft outreach copy.
- Draft launch narrative.
- Prepare HN-style technical post outline.
- Prepare demo script.
- Create source list and competitor notes.

## Interview Script

Opening:

- Tell me about the last time you used AI to change code in a real repo.
- What did you ask it to do?
- What happened after it produced code?
- What made you trust or distrust the result?

Workflow:

- What tasks would you delegate if the result came with tests, diff, logs, and screenshots?
- Which tasks would you never delegate?
- Do you prefer AI work to happen in your editor, terminal, browser, GitHub, or a desktop app?
- How do you currently verify AI-generated code?

Trust:

- What evidence would make you comfortable reviewing a PR faster?
- What would make you comfortable merging?
- What evidence is useless noise?
- What failures are acceptable if the tool explains recovery?

Buying:

- Would this be a personal tool or team tool?
- What would trigger payment?
- Would you pay for local execution, PR reports, shared policy, hosted runners, or audit logs?
- Who else would need to approve this?

Close:

- Can we run a real session on one of your repos?
- What task should we try first?
- Who else should we talk to?

## Pilot Runbook

Before pilot:

- Confirm repo is Bun/TypeScript and has `bun.lock`.
- Ask user for one bounded task.
- Ask for expected verification command if not obvious.
- Confirm they are comfortable with local app-managed worktrees.
- Explain that acceptance creates a local branch only after verification.

During pilot:

- Open repository.
- Approve policy.
- Start session.
- Let user observe approvals, activity, gates, diff, and artifacts.
- Ask user to narrate trust or confusion.
- If verification fails, ask whether the failure is understandable and recoverable.
- If verification passes, ask whether they would accept or review the branch.

After pilot:

- Record task type.
- Record session outcome.
- Record time to first session.
- Record time to verified branch.
- Record accepted or rejected branch.
- Record top objections.
- Ask willingness to pay.
- Ask for beta referral.

## MVP Decisions To Lock

| Decision | Default |
| --- | --- |
| First platform | Apple Silicon macOS |
| First repo type | Bun TypeScript repositories |
| First engine | Codex local |
| First output | Verified local branch |
| First cloud use | GitHub metadata, waitlist, run history later |
| First buyer | Solo pro and small teams |
| First paid feature | Reports, GitHub PR helper, shared policies |
| First marketplace item | Task templates and policy packs |

## Open Questions

- Should evidence reports be local-only first, or sync to web for sharing?
- Should GitHub PR creation be in MVP or beta?
- Is Docker verifier setup too much friction for the first run?
- Should the product include a CLI companion for power users?
- How much artifact history should free users keep?
- Which package manager should come after Bun?
- Should private beta require users to already have Codex CLI login?

## Analytics Events

Use allowlisted, metadata-light events.

- `desktop_installed`
- `runtime_health_checked`
- `repository_registered`
- `policy_proposed`
- `policy_approved`
- `session_started`
- `approval_requested`
- `approval_resolved`
- `gate_started`
- `gate_completed`
- `session_verified`
- `session_failed`
- `session_needs_input`
- `branch_accepted`
- `session_discarded`
- `report_exported`
- `pr_created`

Never capture:

- Source code.
- Raw prompts.
- Full file paths.
- Secrets.
- Command output unless explicitly redacted and user-approved.

## Landing Page Draft

H1:

> Merge AI-written code only after it proves itself.

Subhead:

> Code runs AI coding sessions in isolated local worktrees, verifies them with your repo's policy,
> and turns passing work into reviewable branches with evidence.

CTA:

> Join the desktop beta

Proof points:

- Local-first by default.
- Verified before acceptance.
- Diffs, logs, screenshots, traces, and assertions.
- Explicit approvals for risky operations.
- Built for real repos, not toy demos.

Demo sections:

1. Open a repo.
2. Approve verification policy.
3. Delegate a bounded change.
4. Inspect activity and approvals.
5. Review gates and artifacts.
6. Accept a verified branch.

## Launch Assets

Required before public launch:

- Landing page.
- 90-second demo video.
- Sample repo.
- Install docs.
- Evidence report example.
- GitHub PR example.
- Technical architecture post.
- "AI code trust gap" post.
- Pricing page or beta pricing note.
- Changelog.

## Private Beta Exit Criteria

Move to public launch when:

- 20 active beta users have installed the app.
- 100 sessions have run.
- 30 verified branches have been accepted.
- At least 5 users ran more than one session.
- At least 3 teams or users agreed to pay.
- Top 5 onboarding failures have fixes or clear docs.
- Evidence report is understandable without explanation.

## Immediate Next Actions

1. Schedule kickoff.
2. Assign roles.
3. Freeze MVP scope.
4. Select sample repo.
5. Create pilot prospect list.
6. Run 5 interviews.
7. Verify current desktop flow.
8. Draft landing page.
9. Draft evidence report export.
10. Recruit first 3 pilots.
