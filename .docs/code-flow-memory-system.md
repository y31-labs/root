# Code Flow Memory System

Last updated: 2026-07-03

## Product Idea

Code should not become a notes app for user flows. The stronger idea is a flow memory system:
small durable artifacts, explicit links, append-only history, easy navigation, and an AI-readable
structure.

The product promise:

> Every meaningful workflow step has a history, owner, reason, evidence trail, and impact map.

This is a business memory layer for software workflows. It connects what users did, what the
product expects, which decisions changed behavior, what code implemented it, which tickets or
incidents explain it, and which metrics show impact.

The codebase is the source of implementation truth. The cloud memory graph is the source of
interpreted workflow truth. The memory graph must stay commit-aware and evidence-backed instead of
becoming detached documentation.

Hard rules:

- The canonical memory graph represents `main`.
- Pull requests and local sessions are preview inputs, not canonical memory state.
- The product should not store canonical memory inside the project repository.
- AI can propose mappings, summaries, and links, but evidence and validation decide what becomes
  current.
- No source, no claim.

## Core Model

The system should document workflows as linked structured objects, not screenshots or long prose.

```text
Flow
  -> Step
      -> Action
      -> Business rule
      -> Decision
      -> Evidence
      -> Owner
      -> Outcome
      -> Related flow
```

A useful answer should sound like:

> In the onboarding flow, the user verifies identity because `decision.kyc-before-payout`
> introduced KYC before payout activation. This step affects the high-risk merchant segment, is
> owned by Compliance, and changed after `incident.payout-fraud-spike`.

The important move is that each object is addressable and linkable. The primitive is not a page; it
is a linked action.

## Object Types

Start with six object types.

| Object | Purpose |
| --- | --- |
| Flow | A business process such as onboarding, checkout, refund, approval, or payout. |
| Step | A meaningful stage inside a flow. |
| Action | Something a user, system, or team does. |
| Decision | Why something exists or changed. |
| Evidence | A source event, ticket, document, support case, metric, trace, or session artifact. |
| Comment | A review question, correction, verification request, blocker, or decision note attached to a claim, edge, entity, or proposal. |

Everything else should begin as metadata or edges. Avoid adding overlapping abstractions like
journey, task, process, workflow, scenario, case, and operation until the product proves it needs
them.

## Action Cards

Action cards are a durable projection of cloud memory entities. They should have stable IDs and can
be exported as simple Markdown with frontmatter, but Markdown is not the source of truth.

```md
---
id: action.checkout.apply-coupon
type: action
flow: flow.checkout
actor: customer
status: active
introduced_by: decision.2026-07-03-discount-policy
related_rules:
  - rule.coupon.max-one-active
  - rule.pricing.final-price-calculation
source_events:
  - event.01JZABC
---

# Apply Coupon

The customer enters a coupon before payment.

## Why This Exists

Introduced to support partner campaigns without changing base pricing.

## Preconditions

- Cart exists.
- Coupon is not expired.
- Customer is in an eligible market.

## Outcomes

- Coupon accepted.
- Coupon rejected.
- Manual review required.
```

The stable ID lets AI produce precise impact analysis:

> This decision affects `action.checkout.apply-coupon`,
> `rule.pricing.final-price-calculation`, and `metric.checkout.conversion-rate`.

## Decision Cards

Decision cards should capture product and business decisions, not only architecture decisions.

```md
---
id: decision.2026-07-03-require-phone-before-booking
type: decision
status: accepted
owners:
  - growth
  - fraud
affects:
  - flow.booking
  - step.booking.contact-details
  - metric.booking-completion-rate
---

# Require Phone Number Before Booking

## Context

Fraud reports increased after anonymous checkout was introduced.

## Options Considered

1. Ask for phone before booking.
2. Ask for phone after payment.
3. Only ask suspicious users.

## Decision

Ask all users for phone number before final confirmation.

## Consequences

- Better fraud review.
- Possible conversion drop.
- More support tickets from privacy-sensitive users.

## Review Date

2026-08-03
```

These cards let users ask:

- Why do we ask for phone number before booking?
- Which decision caused the conversion drop?
- What flows are affected if we remove phone verification?

## Event Log And Projections

The source of truth should be a cloud append-only event log. Human-readable docs should be generated
projections over that log and graph. Project repositories should only provide signals such as commit
SHAs, changed paths, flow IDs, verified artifacts, and source references.

```json
{
  "id": "evt_01JZABC",
  "type": "flow.step.completed",
  "time": "2026-07-03T18:22:10Z",
  "actor": {
    "type": "user",
    "id": "user_123"
  },
  "object": {
    "type": "step",
    "id": "step.checkout.payment"
  },
  "flow_id": "flow.checkout",
  "session_id": "session_789",
  "source": "web_app",
  "repository": {
    "id": "repo_123",
    "main_commit_sha": "abc123"
  },
  "metadata": {
    "market": "LT",
    "device": "desktop"
  }
}
```

Projected docs can be exported as a portable Markdown tree:

```text
/flows/checkout.md
/actions/checkout/apply-coupon.md
/decisions/2026-07-03-discount-policy.md
/rules/coupon/max-one-active.md
/metrics/checkout-conversion.md
```

Events give machines provenance. Markdown gives humans portability. AI gets both context and source
links. The exported tree is optional output, not canonical storage.

## Main Sync Model

The memory graph tracks only `main`. GitHub pull requests and local Code sessions can create preview
proposals, but canonical memory updates only when the relevant change lands on `main`.

```text
push to main
  -> ingest commit metadata
  -> detect changed paths
  -> compare against known source references
  -> mark affected memory nodes stale
  -> ask AI to propose updates
  -> validate proposal shape and citations
  -> resolve review comments and verification blockers
  -> promote verified nodes to current
```

Every memory object that reflects code should carry a code anchor:

```ts
{
  repositoryId: string;
  mainCommitSha: string;
  paths: string[];
  contentDigest?: string;
  verifiedAt?: string;
  status: 'current' | 'stale' | 'proposed' | 'blocked' | 'removed';
}
```

The product should prefer stale status over silent mutation. When `main` changes and the system can
see that a known source path changed, it should mark related entities and edges stale until the
change is verified or explicitly accepted.

## Graph Behavior

The product should think in graphs, not documents.

```text
decision.require-phone
  -> affects step.enter-phone
  -> affects flow.booking
  -> affects metric.booking-conversion
  -> justified_by incident.fraud-spike
  -> owned_by team.fraud
```

Opening any node should show:

- Backlinks.
- Timeline.
- Related decisions.
- Related metrics.
- Related support tickets.
- Related user sessions.
- Current owner.
- AI summary.
- Raw evidence.

The high-value interaction is asking any object why it exists:

- Why does this step exist?
- Who added it?
- What decision introduced it?
- What happens if we remove it?
- Which users hit this branch?
- Which flows depend on it?
- Has this rule changed recently?

## Capture Moments

The product should not ask people to write documentation from scratch. It should capture memory at
moments where change already happens.

When a PM changes a flow, ask:

- What changed?
- Why?
- What decision does this belong to?
- Which metric should be watched?

When an engineer merges a PR, draft links:

- This PR appears to affect `flow.checkout`.
- This PR appears to affect `action.checkout.apply-coupon`.
- This PR appears to affect `rule.pricing.final-price`.
- Attach to an existing decision or create a new one?

When a user completes a flow, record structured events silently.

When a support issue appears, suggest the relevant step:

> Support issue `#421` seems related to `step.booking.payment-verification`. Link it?

When AI summarizes, require citations to source nodes or events. No source, no claim.

## AI Governance

AI should map data to information, but it should not be authoritative. Treat AI output as a proposal
inside a deterministic evidence machine.

```text
raw data
  -> deterministic extraction where possible
  -> AI interpretation proposal
  -> schema validation
  -> source and citation validation
  -> graph consistency checks
  -> review comments and verification requests
  -> promotion to current memory
```

Facts and interpretations should be stored separately.

Facts:

- Commit `abc123` changed `src/checkout/coupon.ts`.
- Test `checkout-e2e` passed.
- Artifact `screenshot_123` exists.
- Flow `checkout` references `src/checkout/coupon.ts`.

Interpretations:

- This change affects coupon redemption.
- This decision changed checkout behavior.
- This step exists because of fraud risk.
- This flow is stale after the latest `main` commit.

Interpretations should carry provenance:

```ts
{
  claim: string;
  status: 'proposed' | 'verified' | 'rejected';
  confidence: 'low' | 'medium' | 'high';
  sources: EvidenceRef[];
  generatedBy: 'ai' | 'human' | 'system';
}
```

Use AI for small, bounded mapping tasks. Ask it to explain one commit, one flow, one stale node, or
one evidence bundle at a time. Large repository-wide interpretation should be composed from smaller
validated proposals.

## Verification Comments

Comments should be a first-class verification layer. They should attach to the risky parts of the
graph: claims, edges, entities, and proposals.

Useful comment kinds:

- Question: "Why did you link this to onboarding?"
- Verification request: "Check if this only affects partner coupons, not all coupons."
- Correction: "This belongs to billing, not checkout."
- Decision note: "Product agreed to keep this behavior."
- Blocker: "Do not promote until support confirms."

A comment can block promotion of proposed memory:

```ts
{
  id: "comment_123",
  targetType: "claim" | "edge" | "entity" | "proposal",
  targetId: "claim_456",
  kind: "verification_request",
  body: "Verify whether this only affects partner coupons, not all coupons.",
  status: "open" | "resolved" | "rejected",
  createdBy: "human" | "ai" | "system",
  resolution?: {
    outcome: "confirmed" | "corrected" | "rejected";
    evidence: EvidenceRef[];
    summary: string;
  }
}
```

Promotion should require open blocking comments to be resolved. Resolved comments become evidence
for future AI context packs, so Claude and other assistants can distinguish confirmed memory from
unresolved doubt.

## AI Use Cases

Expose compact linked context packs instead of giant text dumps.

Good context:

```text
flow.booking
decision.require-phone
step.enter-phone
metric.booking-conversion
last_20_events
open_incidents
```

Use AI for:

- Flow reconstruction: generate the current checkout flow from observed events.
- Decision explanation: explain why a step exists with links.
- Change impact analysis: show affected decisions, rules, flows, and metrics.
- Freshness checks: compare projected docs with production events.
- Business memory: answer past decision questions.
- Test generation: generate test cases from branches in the flow.
- Onboarding: explain a flow to a new team member.

AI can write summaries, but links make them trustworthy.

## Architecture Sketch

```text
Code Desktop, GitHub, CI, support, analytics
  -> event inbox
  -> normalization pipeline
  -> cloud append-only event store
  -> entity resolver
  -> graph store
  -> projections
       -> Code website visualization
       -> timelines
       -> metrics views
       -> AI context packs
       -> Markdown export
```

A practical storage shape:

| Table | Key fields |
| --- | --- |
| repositories | id, provider, owner, name, default_branch, current_main_sha, connected_at |
| events | id, repository_id, main_commit_sha, type, source, actor_id, object_id, flow_id, timestamp, payload, hash, previous_event_hash |
| entities | id, repository_id, type, title, status, owner, main_commit_sha, source_paths, created_at, updated_at |
| edges | from_entity_id, to_entity_id, relation_type, confidence, status, created_by, source_event_id |
| claims | id, target_type, target_id, claim, status, confidence, sources, generated_by |
| comments | id, target_type, target_id, kind, body, status, created_by, resolution, created_at |
| documents | entity_id, markdown, frontmatter, generated_from_event_id, updated_at |
| artifacts | id, repository_id, event_id, kind, storage_url, digest, created_at |

The critical table is `edges`. That is where the linked-memory behavior lives.

## MVP

Start with one repository on `main` and one flow type, such as checkout, onboarding, approval,
support escalation, or booking.

MVP features:

- Cloud event ingestion for GitHub `main` pushes and verified Code session evidence.
- Main-only repository sync ledger with current, stale, proposed, blocked, and removed states.
- Flow map with steps, branches, completion/drop-off, and related decisions.
- Action cards with backlinks, owner, rules, and source events.
- Decision log with affected flows/actions and review dates.
- Review comments attached to claims, edges, entities, and proposals.
- Immutable event history.
- AI Q&A with citations.
- Markdown export of the full graph as a portability feature.

Markdown export matters because users should feel that their product knowledge is portable and not
trapped in the app.

## What To Avoid

Do not record every low-level click as first-class knowledge.

Low-value events:

- User clicked input.
- User hovered button.
- User opened dropdown.
- User closed modal.

Useful events:

- User started booking.
- User selected refundable fare.
- User failed payment.
- User abandoned at identity verification.
- Agent approved exception.
- Manager overrode fraud rule.

Also avoid AI-generated documentation that is not grounded in events. It may look impressive at
first, then become untrusted.

Do not let AI silently mutate canonical memory after code changes. Mark affected memory stale,
create a proposed update, require citations, and resolve blocking comments before promotion.

## Relationship To Code

This idea extends the existing Code direction around verified evidence and flow coverage.

Near term, Code can use the flow memory model to improve the Flow Coverage Workbench described in
`.docs/code-desktop-user-flows.md`:

- Treat verified session artifacts as evidence nodes.
- Treat coverage states and transitions as flow, step, and action nodes.
- Link accepted changes to decisions and affected flows.
- Publish verified session evidence to the cloud after user approval.
- Generate Markdown exports from the cloud memory graph.
- Let AI answer questions using only cited events, artifacts, and cards.

Longer term, this can become a product category adjacent to verified AI change management:

> A living memory graph for product flows, decisions, and operational actions.
