# Austi core values

## Product thesis

Agent conversations are excellent for understanding intent and creating new things, but they are
an expensive and inconsistent runtime for repeated work. A useful workflow should not require the
agent to infer the same interface, rules, and actions every time it is used.

Austi uses inference to create or revise a durable app. Once published, that app runs as normal
software: its interface is composed from trusted primitives, its state is persistent, and its
actions use explicit host capabilities. This amortizes the cost of inference across every future
use while giving the user a faster and more legible experience.

The concise promise is:

> Use the agent to build the workflow once; use the app to run it repeatedly.

## 1. Apps are the durable product

The primary user-facing artifact is an app, not a prompt, skill, or chat transcript. A successful
conversation should leave the user with software they can reopen and use without reconstructing
the original reasoning.

Skills may remain useful as internal knowledge for the builder, but users should not need to
discover, select, invoke, or understand skills. Austi is app-first, not skill-first.

This means:

- Repeated workflows run without a new agent turn.
- Apps have stable identity, persistent state, and revision history.
- Users can return to the app directly from the product navigation.
- Editing evolves the existing app instead of producing another disposable answer.

## 2. The agent builds; the host runs

The agent is responsible for interpreting intent and authoring an app. It is not the authority that
executes the app's ongoing operations.

At runtime, the native host owns compilation, storage, authentication, permissions, capability
invocation, and isolation. Generated code can request an operation only through the documented SDK;
it cannot grant itself access or carry credentials.

This separation should remain clear:

- Agent output is untrusted input.
- The host validates every published revision.
- Runtime behavior is deterministic except where a declared external capability is invoked.
- Secrets and connector responses never become embedded in app source or metadata.

## 3. Better interfaces beat repeated conversation

Chat is the authoring surface, not the universal interface. Once a workflow is understood, a
purpose-built interface should make its state, controls, and outcomes easier to see than another
round of prompting.

Austi provides a curated component catalog so the agent assembles familiar, accessible interfaces
instead of inventing a design system for every app. Shared primitives should encode good defaults
for layout, forms, status, data display, loading, errors, and accessibility.

The catalog should be:

- Small enough for the agent to use reliably.
- Broad enough to build genuinely useful operational tools.
- Consistent with Austi's minimal, flat visual language.
- Versioned so existing apps remain stable as the host evolves.

## 4. Local-first means user-owned

Apps, their source, revisions, and working state belong to the user and should remain useful on the
local machine. The product should not require a hosted Austi backend for ordinary use.

Local-first also creates obligations:

- Storage must be durable, recoverable, and understandable.
- Users need explicit ways to delete, export, restore, and reset their data.
- Updates must preserve existing apps and state through documented migrations.
- Failures must be visible; persistence errors must never disappear only into logs.

External services may extend an app, but they should not silently become the owner of it.

## 5. Authority is explicit and narrow

An app receives only the capabilities declared in its published revision. The host mediates every
capability call and is the final authority on whether it is available and allowed.

Permission UX must answer four questions before a consequential action:

1. Which app is asking?
2. What operation will run?
3. What data or system will it affect?
4. Is approval for one call, the current session, or future use?

Capability effects must come from trusted host or connector metadata, not merely from an
agent-authored description. Read, write, network, filesystem, and secret access should be visible
and independently enforceable wherever possible.

## 6. Generated code is never trusted

Compilation success does not make generated code safe or correct. Every revision must be treated as
potentially malformed, hostile, resource-intensive, or incompatible with existing state.

The runtime should therefore provide:

- A real isolation boundary rather than relying on source-text restrictions.
- Resource and time limits with a user-controlled stop or reset path.
- Schema and size validation at every host boundary.
- Recovery from corrupt source, bundles, and persisted state.
- Adversarial tests for capability escalation and native IPC access.

Source validation is useful feedback for the builder, but it is defense in depth rather than the
security boundary.

## 7. Apps are living software

An app should become more valuable as it is used. Revisions must preserve unrelated behavior and
user data, and the user should be able to understand what changed.

Durable app lifecycle includes:

- Revision history and rollback.
- State schema evolution and migrations.
- Repairing a broken revision without losing the last working one.
- Renaming, duplicating, archiving, deleting, exporting, and importing.
- A reliable path back to an authoring conversation without making that conversation the sole
  owner of the app's future.

The published app, not a fragile chat session, is the durable center of the lifecycle.

## 8. Efficiency is a product property

Lower inference cost is valuable only if the resulting app is used and remains correct. Austi
should optimize total workflow cost, including generation, repair, runtime latency, connector calls,
and user attention.

The product should measure at least:

- Cost and latency to publish the first working revision.
- Compile and publish failure rates.
- Number of repair turns before first use.
- App opens and repeated interactions that do not require inference.
- Capability latency, errors, and approval denials.
- Revision frequency and abandonment.

These measurements should be privacy-preserving, clearly disclosed, and optional where they leave
the local machine.

## 9. Transparent failure builds trust

Austi should state what happened, what was preserved, and what the user can do next. It should not
pretend an app was created when publication failed, hide storage errors, or silently drop corrupt
records from navigation.

Errors should be actionable at the surface where they occur. Logs are supporting evidence, not the
only place a user can learn that their work was not saved.

## 10. Focus beats generality

Austi is designed for durable dashboards, trackers, status views, workflows, and internal tools.
It does not need to become an unrestricted browser, a general operating-system scripting host, or a
replacement for every conversational task.

The default decision rule is:

- Use chat when intent is still being discovered.
- Build an app when the interaction will recur or benefits from visible state and controls.
- Use a direct capability when an operation can be deterministic.
- Use another agent turn only when new interpretation or synthesis is genuinely required.

## Release standard

Austi is ready for broad release when a new user can install a signed build, connect the required
provider, create an app without separately installing development tooling, understand and control
its permissions, recover from a broken revision, and update Austi without losing apps or state.

The release bar is not merely that the demo works. It is that apps remain safe, durable, legible,
and cheaper to use again than reconstructing the same result through inference.
