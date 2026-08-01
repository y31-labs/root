# Austi landing concept

Status: working creative brief
Surface: `apps/austi-landing`
Mode: Persuade

## The idea

> **An app that'll make you question your job.**

Austi turns one conversation into private, reusable software that lives on the user's Mac. The
landing page should sell the relief of having the app you need finally take shape and stay—not the
novelty of talking to an agent.

The line is intentionally ambiguous: it can mean the app is powerful enough to threaten the work,
or useful enough to make the visitor reconsider which parts of the job deserve a person at all. The
page resolves that tension by showing Austi taking recurring work while the user keeps judgment,
ownership, and control.

The emotional movement is:

| Before Austi | After Austi |
| --- | --- |
| The useful part of a conversation disappears into history. | The useful part becomes an app. |
| A recurring workflow must be explained again. | The app reopens with its interface and state intact. |
| The agent remains the runtime and the bottleneck. | The agent builds; ordinary software runs. |
| Generated behavior feels opaque or overpowered. | Local ownership and narrow authority make the result legible. |

The page is not selling “AI app generation.” It is selling the feeling that a good way of working
can finally become durable.

## Positioning

### Primary promise

**An app that'll make you question your job.**

### Plain-language explanation

**Austi turns one conversation into private, reusable software that lives on your Mac.**

### Product thesis

**It clocks in where the chat clocks out.**

### Proof sentence

**Tell Austi what keeps repeating. It builds a private Mac app that takes it from here.**

### Primary action

**Download the preview**

### Supporting action

**See what it takes off your plate**

The primary action always links to the existing GitHub releases destination. The page must continue
to describe Austi as a preview and must not imply customers, benchmarks, pricing, or availability
that the repository does not establish.

## Narrative principle

Every major viewport communicates one idea. The implementation may be technically rich, but the
visitor should experience a calm sequence with almost no cognitive load.

The page follows this arc:

1. **Feel the tension:** Austi may be able to do an uncomfortable amount of the recurring work.
2. **See the desired result:** a finished, purpose-built app is already there and ready to use.
3. **Understand the mechanism:** Ask → Build → Open → Keep.
4. **Believe the result is durable:** the same app can be reopened, revised, and continue holding state.
5. **Resolve the trust question:** the Mac owns storage, execution, permissions, and outside access.
6. **Return to the emotional promise:** make the workflow once; keep the software.

Trust appears only after the value is desirable. Technical architecture supports the story; it does
not lead it.

## Page structure and phrasing

### 1. Opening: emotional promise

**Communication objective:** The visitor immediately understands that Austi makes apps, then feels
the provocative possibility that one of those apps could absorb a meaningful part of the workload.

- Headline: **An app that'll make you question your job.**
- Supporting copy: **Tell Austi what keeps repeating. It builds a private Mac app that takes it from
  here.**
- Primary action: **Download the preview**
- Supporting action: **See what it takes off your plate**
- Product proof: a near-life-size finished **Launch planner** app, visibly operable and marked
  **Saved locally**.
- Composition: emotional copy occupies a quiet field; the finished app is the largest object in the
  viewport. The request that produced it is present only as a small piece of provenance.
- Motion: the app settles into place once, followed by the saved-local state. Motion guides the eye
  from promise to result; it does not loop for attention.

The first viewport must answer three questions within seconds:

- What is this? A tool that makes reusable apps from a conversation.
- Why should I care? The recurring part of the job can become software instead of another task.
- What do I do next? Download the preview or inspect how the app stays.

### 2. Mechanism: where the app clocks in

**Communication objective:** Make Austi's unique mechanism unmistakable without explaining model
architecture.

- Headline: **It clocks in where the chat clocks out.**
- Supporting copy: **Describe the outcome once. Austi turns it into an interface you can open,
  use, and improve whenever the work returns.**
- Interaction: one controlled product stage moves through **Ask**, **Build**, **Open**, and **Keep**.
- Product proof: the same Launch planner remains in view while its state changes. Do not swap among
  unrelated mock products.

Stage language:

| Stage | Label | Supporting phrase | Visible proof |
| --- | --- | --- | --- |
| Ask | **Start with what you want done** | Start with the work, not the wiring. | “Build a weekly launch planner that tracks owners, dates, and blockers.” |
| Build | **Watch the idea find its interface** | Structure, state, and controls appear in the open. | A short, legible build sequence resolves into the planner. |
| Open | **Skip the recap. Open the app.** | Reopen it directly when the work returns. | The published planner appears in Austi's navigation with saved state. |
| Keep | **Change it without starting over** | Revise the app while preserving the work inside it. | A due date changes and a new revision is published without resetting the planner. |

Motion is choreographed as one transformation: request → structure → working app → preserved
revision. Manual controls remain available and autoplay pauses after user interaction.

### 3. Outcome: your job, minus the repeating-yourself part

**Communication objective:** Make the output feel useful enough to return to, not like a screenshot
of a chatbot result.

- Headline: **Your job, minus the doing-it-again part.**
- Supporting copy: **The interface fits the workflow, remembers its state, and picks up where you
  left it. Less prompting. More work already done.**
- Product proof: show the finished Launch planner at working scale with owners, dates, blockers,
  statuses, and a local-save state.
- Phrasing inside the product should sound operational: **This week**, **Add item**, **In progress**,
  **Blocked**, **Changes saved locally**.

This section should feel denser than the surrounding page because the product—not a decorative
marketing container—carries the detail.

### 4. Durability: better without forgetting

**Communication objective:** Turn “reusable” from a claim into a visible lifecycle.

- Headline: **Gets better without forgetting.**
- Supporting copy: **Return to the authoring conversation when the workflow changes. Austi publishes
  a new local revision and preserves the work that still belongs.**
- Product proof: compare the current and revised state of the same planner. Emphasize what changed
  and what was preserved.
- State language: **Revision 2 published**, **6 rows preserved**, **Ready to reopen**.

The motion should show continuity: one value changes while the surrounding application stays still.
The effect should feel reassuring, not magical.

### 5. Trust: works for you, answers to your Mac

**Communication objective:** Resolve the natural concern created by giving generated software access
to local data or external tools.

- Headline: **Works for you. Answers to your Mac.**
- Supporting copy: **Austi stores and runs apps locally. Outside access stays narrow, visible, and
  subject to your approval.**
- Product proof: an explicitly labelled illustrative permission request showing the app, operation,
  data, destination, and duration of approval.
- Choice language: **Keep local** and **Allow this action**.
- Result language: **No action was sent. The planner keeps working locally.** or **Completed once.
  Access expired after this action.**

The interaction is real and reversible. It demonstrates control rather than decorating the section
with shields, locks, or abstract security graphics.

### 6. Close: go look busy

**Communication objective:** End the narrative rather than simply stopping after the trust section.

- Headline: **All done. Go look busy.**
- Supporting copy: **Build the app only your work could describe. Keep it on the Mac already doing
  the work.**
- Primary action: **Download Austi**
- Availability line: **Preview for macOS · Apple silicon**

The close releases the tension established in the hero with a dry joke. The page has already shown
the real product boundaries, so the humor lands as confidence rather than an unsupported promise.

## Language system

Dia's strongest phrases work because they are simultaneously literal product descriptions and
human observations. Austi's language should do the same. Its wordplay comes from workplace anxiety
and the lifecycle of durable software: jobs, bosses, clocking in, repeated work, ownership, and who
ultimately answers to whom.

### Locked campaign phrases

These lines are approved verbatim. Their wording and punctuation are intentional and should not be
normalized during implementation.

- **Starving for work yet?**
- **Put it in ~~writing~~ apping.**
- **“Not my job,” you say. Finally.**
- **All done. Go look busy.**

### Governing phrases

| Product truth | Phrase |
| --- | --- |
| Recurring work can become a reusable app. | **An app that'll make you question your job.** |
| The app outlives the authoring conversation. | **It clocks in where the chat clocks out.** |
| The app reopens with persistent state. | **Still working long after you stopped prompting.** |
| Repeated use does not require another prompt. | **Your job, minus the doing-it-again part.** |
| Revision preserves unrelated behavior and data. | **Gets better without forgetting.** |
| The user controls external capabilities. | **Works for you. Answers to your Mac.** |
| The app has already handled the recurring work. | **All done. Go look busy.** |

### Supporting phrase bank

These can appear as section copy, product captions, or restrained interaction labels. They should
not all appear on the same page.

- **An app so good, your boss may have questions.**
- **Software that does your job. You keep the title.**
- **Built in conversation. Suspiciously useful outside it.**
- **Start with the work, not the wiring.**
- **Watch the idea find its interface.**
- **Skip the recap. Open the app.**
- **Picks up where you left it.**
- **Change the app, not the habit.**
- **Your workload just got replaced.**
- **Do less. Look suspiciously effective.**

### Phrase construction rules

- Name the concrete object early: **app**, **workflow**, **conversation**, or **Mac**.
- Let the second half reveal the emotional benefit or a second meaning.
- Use familiar language instead of category terminology.
- Keep the line easy to say aloud and short enough to remember.
- Prefer verbs that belong to both software and daily life: **ask**, **open**, **keep**, **leave**,
  **return**, **remember**, **pick up**, **stay**.
- Pair playful language with exact product proof in the same viewport.
- Do not force a pun where a direct sentence would create more trust.

## Breathing and information density

“Spacious” means disciplined attention, not merely large padding.

- Give each major viewport one headline, one visual argument, and one next step.
- Leave meaningful silence around the emotional promise and section transitions.
- Concentrate complexity inside the product windows; keep the marketing field quiet.
- Let product visuals appear at a scale where their interfaces can be understood, not as thumbnails.
- Alternate calm fields with dense product evidence so the scroll has rhythm.
- Use one strong sentence where a group of feature cards would otherwise repeat the same idea.
- Keep reading copy narrow and short. Long technical explanations belong in product documentation.
- Do not use a bento grid, icon-and-copy feature cards, integration-logo walls, statistic bands, or
  decorative AI imagery.

The desired experience is high production complexity with low consumption complexity.

## Copy voice

The voice is direct, assured, and built around corporate dark comedy. It says the uncomfortable part
out loud—the software may be able to absorb a surprising amount of the job—then proves that the
person remains the author, owner, and authority.

### Prefer

- States of being: **ready to reopen**, **keeps working**, **stays local**, **without starting over**.
- Concrete objects: **app**, **planner**, **revision**, **rows**, **owners**, **dates**, **blockers**.
- Short verbs: **build**, **open**, **use**, **keep**, **change**, **allow**.
- Controlled provocation: bosses, jobs, clocking in, and suspicious productivity are fair territory.
- Dry delivery: the line is funnier when the design does not wink or explain the joke.
- Exact proof immediately after a provocative claim.

### Avoid

- “AI-powered,” “agentic,” “10×,” “revolutionary,” “magic,” or model terminology in primary copy.
- Vague productivity claims that could describe any assistant.
- Literal slavery language; its historical weight overwhelms the product and turns the wrong thing
  into the story.
- Explaining architecture before the visitor wants the result.
- Treating the conversation or prompt field as the product's hero.
- Invented social proof, integrations, benchmarks, or enterprise promises.
- Repeating “local-first” as a slogan when the interface can prove local ownership directly.

## Product and marketing should share one world

The website should feel like an extension of Austi rather than a shell around it.

- Marketing typography becomes product hierarchy at a smaller scale.
- The page and the app share surface shapes, borders, control language, spacing discipline, and state
  colors.
- Product windows have physical presence, but depth is reserved for objects that genuinely float.
- Labels, controls, and status copy remain native and precise even when the page becomes expressive.
- The same Launch planner artifact appears throughout the page so the story accumulates rather than
  restarting in each section.

The subconscious promise is: **if the landing page is this composed, the software may be this
composed too.**

## Motion principles

- Motion always answers: **what should I look at next?**
- Use one authored request-to-app transformation as the page's signature sequence.
- Let surfaces enter, focus, and hand attention to the next state; avoid identical reveal animations
  on every section.
- Keep text and essential controls visible by default.
- Use restrained hover feedback for controls and product objects.
- Pause autoplay after manual interaction.
- Under reduced motion, present every state clearly without transitional movement.

## Responsive behavior

- On smaller screens, the emotional promise and action come before the product window.
- The product remains the dominant proof, but crops or simplifies secondary columns rather than
  shrinking into illegibility.
- The Ask / Build / Open / Keep controller appears before the content it changes.
- Secondary product metadata may collapse, but the request, app identity, current state, and local-save
  proof remain visible.
- Permission details stack in the order a person needs to evaluate them: app, operation, data,
  destination, duration, decision.
- The page must remain usable with keyboard navigation, visible focus, semantic headings, and reduced
  motion.

## Boundaries

- Preserve the Austi name, existing logo, preview status, and current GitHub release destination.
- Preserve the product truth in `.docs/austi/README.md` and `.docs/austi/core-values.md`.
- Do not fabricate customers, testimonials, usage metrics, benchmarks, pricing, availability, or
  security certifications.
- Product data used in demonstrations is illustrative and should be labelled when a visitor could
  mistake it for real user data or a shipped integration.
- Borrow Dia's alignment of positioning, copy, product visuals, pacing, motion, and trust—not its
  literal typography, imagery, layouts, or brand assets.

## Success criteria

The concept is working when:

- A first-time visitor can explain Austi as “the thing that turns one conversation into an app I can
  keep.”
- The hero creates recognition before it explains implementation.
- A finished, useful product outcome appears before feature explanation.
- Every major viewport has one communication objective.
- Motion directs attention through the product lifecycle.
- Trust and local ownership are demonstrated after the product value is established.
- The final call to action closes the emotional story introduced at the top.

## Open decisions before implementation

- The selected hero line is **An app that'll make you question your job.**
- Confirm whether the Launch planner should remain the single canonical product artifact across the
  entire page.
- Confirm whether the supporting hero action should jump to the mechanism demonstration or play a
  short product film if a real film asset becomes available.
