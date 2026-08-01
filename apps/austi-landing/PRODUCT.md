# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience (inferred from the product docs and landing-page brief): technical builders and
operators—founders, product people, and developers—who repeat structured work and want a durable
tool instead of reconstructing the same workflow through chat.

## Product Purpose

Austi is an app-first desktop environment that turns natural-language requests into durable,
local software. The agent interprets and revises the workflow; the resulting app becomes the
repeatable product. Success means a useful conversation leaves the user with software they can
reopen, operate, and evolve without replaying the original reasoning.

## Positioning

Use the agent to build the workflow once; use the app to run it repeatedly. Austi amortizes
inference into persistent software whose interface, state, revisions, permissions, and execution
are owned by the native host rather than by a fragile chat session.

## Operating Context

Users describe dashboards, trackers, status views, internal tools, and recurring workflows in a
desktop authoring conversation. Austi builds and publishes the app locally, exposes it in product
navigation, keeps its working state, and provides a path back to the authoring conversation when
the workflow needs to change.

## Capabilities and Constraints

- Austi is a native desktop product for macOS; this artifact is its marketing website.
- Apps are built from trusted primitives and run in a network-disabled sandbox by default.
- The host owns compilation, storage, authentication, permissions, capabilities, and isolation.
- Apps declare narrow capabilities and ask before approved integrations touch external services.
- Generated code is untrusted input and cannot grant itself access or carry credentials.
- Published apps have stable identity, persistent state, revisions, and a path to future edits.
- The product is focused on durable operational tools, not unrestricted automation or a universal
  replacement for conversational work.
- The current public release status is a preview; the landing page must not invent customers,
  benchmarks, pricing, availability, or security claims beyond repository evidence.

## Brand Commitments

- Preserve the Austi name and existing logo at `public/austi-logo.svg`.
- Voice is direct, assured, precise, and low-hype.
- The landing page should feel modern, breathable, spacious, and professionally built by a large,
  quality-focused software company.
- Dia's landing page is a binding craft reference for spacious composition, people-led personality,
  product demonstration, and small, purposeful microinteractions—not a template to copy.

## Evidence on Hand

- Product definition and decision criteria: `../../.docs/austi/README.md` and
  `../../.docs/austi/core-values.md`.
- Existing product demonstration and factual marketing copy:
  `src/pages/index.astro`.
- Existing brand asset: `public/austi-logo.svg`.
- Current download destination: `https://github.com/y31-labs/root/releases`.
- No customer logos, testimonials, usage metrics, pricing, awards, or third-party validation are
  present; future work must not fabricate them.

## Product Principles

1. Apps are the durable product; chat is the authoring surface.
2. The agent builds and revises; the trusted host runs and governs.
3. Purpose-built interfaces beat repeated conversation for recurring work.
4. Local-first means user-owned, recoverable, understandable software and data.
5. Authority stays explicit, narrow, and visible.

## Accessibility & Inclusion

The marketing surface must preserve semantic structure, keyboard access, visible focus, reduced
motion support, strong text contrast, and responsive behavior from small phones through wide
desktop screens.
