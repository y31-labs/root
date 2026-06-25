---
title: 'Testing is different now'
description: 'AI made code cheap; tests are how we keep the bill payable.'
publishedAt: 2026-06-24
draft: false
---

> "You should test things that might break." - Kent Beck, [Extreme Programming Explained](https://theswissbay.ch/pdf/Gentoomen%20Library/Software%20Engineering/Addison%20Wesley%20-%20Extreme%20Programming%20Explained.%20Embrace%20Change%20%281999%2C%20Kent%20Benk%29.pdf)

For the past couple of years, the whole industry has been trying to make development faster. Faster scaffolding. Faster refactors. Faster agents. Faster "turn this idea into a working prototype before my coffee becomes emotionally unavailable."

And honestly? It works. We can build things now that would have felt ridiculous not that long ago. A weekend project can become a real app. A solo developer can suddenly move like a small team. A small team can suddenly move like a slightly irresponsible medium team.

Beautiful. Dangerous. Very on brand for us.

Because the part we like to automate is the fun part: creating new stuff. New features, new flows, new buttons, new logic, new clever tiny pieces of functionality that make users happy and engineers feel briefly chosen by the universe.

But every line of code has a hidden price tag. Not a dramatic one. Not a "sell your house and move to the forest" price tag. A boring one.

Maintenance.

On a small project, this price is almost invisible. If the whole app fits in your head, you can pretend there is no problem. You remember the weird auth branch. You know why the billing webhook looks like that. You can make a small-tiny change to the onboarding button and feel reasonably sure that production will not immediately turn into soup.

But then the project grows. Or a second team joins. Or six agents have been politely producing code at 3am. Suddenly nobody has the whole thing in their head anymore. The dependencies are real. The behavior is real. The hidden coupling is very real and, as usual, it did not send a calendar invite.

So now the question becomes a little less cute:

How do we know this still works?

How do we know the small-tiny onboarding button did not break signup, billing, analytics, the welcome email, the first empty state, and that one enterprise customer who somehow uses Safari from 2017?

What are the chances that production goes down?

Zero, yes?

Sure. Very calming.

## We already solved this boring problem

The funny thing is that this problem is not new. We solved it years ago with automated tests.

Unit tests. Integration tests. End-to-end tests. Snapshot tests if you are feeling brave. Contract tests if you enjoy sounding responsible in meetings.

The basic idea is almost annoyingly simple:

Write the functionality. Then write an executable check that proves the functionality still works. Then, when you change something later, the project can yell at you before users do.

That is it. That is the magic trick.

Not because tests prove everything is correct. They do not. Not because tests remove the need to think. Please, no. But because tests turn a chunk of product knowledge into something runnable. They take a tiny piece of "I hope this still works" and convert it into "we know this specific behavior still works."

That sounds boring until the codebase is too large for one brain.

Then boring becomes a superpower.

## The part everyone clapped for was not the interesting part

Remember Cursor's [Scaling long-running autonomous coding](https://cursor.com/blog/scaling-agents) post? Ancient history, obviously. It was published on January 14, 2026, which in AI time is approximately one geological era ago.

The headline was very fun: agents running for days, lots of parallel work, huge amounts of generated code, even a browser-shaped artifact coming out the other side.

Naturally, everyone started yapping about how powerful AI is.

And sure. It is powerful. Very flashy. Much tokens. Big chart energy.

But the part I keep thinking about is less cinematic: long-running agents need feedback loops. They need checks, judges, harnesses, CI, something that tells them whether the work is still coherent. Without that, an agent can still type extremely quickly, but it is typing in the dark.

Tests are the simplest version of that feedback loop.

They are not the whole story, but they are the part we already understand. They are old, boring, slightly unloved, and suddenly extremely relevant again.

## Good old rules of testing

A good test is not a second implementation of your app wearing glasses and pretending to be quality assurance.

A good test is usually:

- written in a straightforward, declarative style
- focused on one behavior
- boring enough that it does not introduce new bugs
- built from a small set of known primitives
- easy to read when it fails
- easy to delete when the behavior no longer matters

In other words, a good test is intentionally kind of dumb.

Which is perfect, because this is exactly the kind of work AI is weirdly good at.

Give a model a limited vocabulary of test helpers. Give it examples. Give it the feature behavior. Ask it to write the dullest possible verification. No clever abstraction. No "while I was here I invented a framework." Just clear setup, clear action, clear expectation.

That is not glamorous work. It is not going to get a million likes on X unless someone puts "autonomous" in the title and adds a gradient. But it is useful work. It is cheap to generate, cheap to review, and cheap to maintain if the primitives are well designed.

And that is the interesting shift.

Humans hate writing tests because they often feel like paperwork after the real work is done.

Agents do not care.

They do not get bored. They do not sigh dramatically because they already implemented the feature and now have to prove it works. They are perfectly happy to grind through repetitive, structured, low-creativity work.

That means the old testing advice did not become obsolete. It became more important.

Keep tests simple. Keep helpers consistent. Keep the behavior explicit. Make the test suite a language that both humans and agents can speak without needing to rediscover the whole codebase every time.

## Tests are memory for codebases

The real value of tests is not just "catch regression." That is the obvious part.

Tests are memory.

They remember that guests can start checkout but cannot apply enterprise coupons. They remember that deleting a workspace should not delete the owner account. They remember that bullish means success, bearish means danger, and no, please do not make another raw green Tailwind class because the theme system exists for a reason.

When a human joins the project, tests explain what matters.

When an agent joins the project, tests explain what matters in a language it can execute.

This is why vibe coding without tests feels fine at first and terrifying later. At the beginning, vibes are enough. The app is small. The feedback loop is you clicking around and saying "seems good."

But once the project gets real, vibes are not an engineering strategy. They are a weather condition.

## Maybe we are automating the wrong layer

So here is the part that feels weirdly under-discussed:

If AI is good at producing repetitive, structured, explicit code, and developers do not particularly enjoy writing repetitive, structured, explicit tests, why are we spending so much energy making the one hundred and first "generate me a landing page" app?

Maybe the more interesting product is not another tool that writes more production code.

Maybe it is a tool that watches a codebase and keeps its safety net alive.

Something that can:

- discover important flows
- generate boring tests around them
- keep those tests aligned as the product changes
- notice when coverage is fake confidence
- explain what behavior a pull request puts at risk
- delete obsolete tests instead of worshipping them forever

Not a magical "AI QA" sticker slapped on a dashboard. An actual testing system designed for the new development loop.

Because if agents are going to write more of the code, they also need a way to prove they did not quietly turn the project into spaghetti with excellent indentation.

And we already know the shape of that proof.

It is boring.

It is executable.

It is tests.

Maybe testing did not become old-fashioned.

Maybe testing is finally the main character.
