# Behavior Flows Concept

## Vision

Behavior Flows gives developers a durable visual model of what their product does. Each graph
captures meaningful user-visible states and the interactions that move the product between them.

Codex can inspect this model while implementing features and propose updates after behavior-changing
work. The graph is not generated documentation that silently follows the code. It is an approved
behavior contract that the developer controls.

## Problem

Product behavior is distributed across routes, components, API handlers, tests, tickets, and human
memory. Code review explains implementation changes but often fails to show:

- which user journeys changed;
- which states became reachable or unreachable;
- whether a new branch has an error or recovery path;
- which existing journeys may need verification;
- whether the implementation changed the intended behavior.

Traditional E2E tests help only after they have been written and maintained. They are also a poor
primary interface for understanding the whole product.

## Ideal User

A developer or small product team that:

- builds interactive web software;
- uses VS Code or a compatible editor;
- delegates implementation work to Codex;
- wants behavior changes visible during code review;
- expects to add executable verification incrementally.

## Core Loop

1. The repository contains approved user-flow files.
2. The extension validates and renders them.
3. A developer or Codex changes application code.
4. Change-impact analysis identifies potentially affected flows.
5. Codex or another producer writes a structured flow proposal.
6. The extension displays the proposal as a graph diff.
7. The developer accepts, edits, or rejects the proposal.
8. Accepted flow changes become ordinary repository changes reviewed and committed with the code.

## Product Principles

- **Behavior is semantic:** model meaningful states and transitions, not every DOM event.
- **Approved and proposed are distinct:** generated output cannot redefine expected behavior.
- **Repository files are canonical:** the visual graph is a projection of reviewable text files.
- **Source links are hints:** source references improve impact analysis but do not define behavior.
- **Uncertainty is visible:** weakly inferred changes are marked for review instead of presented as
  fact.
- **The graph is useful before execution:** the MVP must provide value without Playwright.
- **Execution remains derivable:** contracts should leave room for fixtures, locators, and assertions
  without requiring them today.

## What A Flow Represents

A flow is a bounded user goal such as:

- sign in;
- reset a password;
- create a project;
- invite a teammate;
- complete checkout;
- recover from a failed payment.

A state is an observable product state. A transition is a meaningful user or system interaction
that changes observable behavior.

Avoid modeling low-value mechanics such as focus events, hover events, animation frames, or every
individual keystroke unless they materially affect behavior.

## Differentiation

This is not primarily:

- a generic diagramming tool;
- a session replay product;
- a visual Playwright editor;
- an application analytics dashboard;
- an AI-generated architecture graph.

Its central artifact is a versioned behavior contract maintained alongside implementation changes.

## Long-Term Direction

Approved transitions can gradually gain executable metadata:

- fixtures and preconditions;
- semantic locators;
- actions;
- assertions;
- screenshots;
- accessibility expectations;
- environment requirements.

The same graph can then select and execute affected E2E paths. Execution validates approved
behavior; it must not automatically rewrite that behavior.

