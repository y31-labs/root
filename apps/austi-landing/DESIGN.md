---
name: Austi
description: 'Maintenance coordination for residential property managers.'
colors:
  night-office: '#0a0a0a'
  white: '#ffffff'
  paper: '#eeece5'
  surface: '#f8f6ef'
  ink: '#11110f'
  muted-dark: '#aaa8a1'
  muted-paper: '#66645f'
  accent: '#ff4f42'
  signal: '#dfff57'
  success: '#278a51'
typography:
  fontFamily: 'Clarity City, system-ui, sans-serif'
---

# Design System: Austi

## Visual thesis

**The maintenance desk after hours.** Austi lives between operational urgency and documented
control. Matte black suggests the work that keeps moving beyond office hours; warm paper and ruled
rows make every decision legible. The design should feel calm under pressure, not futuristic or
autonomous for its own sake.

## Hero focal asset

Use the existing empty operations-desk photograph as the first-viewport image. The paperwork makes
coordination burden tangible, while the empty chair supports the promise that intake can begin
before an operator is available. The message and research-stage CTA remain fully readable without
animation.

## Typography and color

- Use Clarity City throughout. Scale and spacing create hierarchy; avoid extra typefaces.
- Keep functional labels at 11px or larger; small status text must remain readable on dense operational views.
- Use warm white text on the night field and dark ink on paper.
- Use red for decisive human action and escalation.
- Use acid yellow only for the active or exceptional workflow state.
- Use green only for a completed operational state.

## Page sequence

1. Hero: one slogan and the workflow-conversation CTA.
2. Workflow: explain the first three moves from message to resolution lifecycle.
3. Controls: show the coordinate, pause, and handover boundary beside one static approval example.
4. FAQ: group operational, safety, data, integration, and research-stage questions for quick scanning.
5. Final CTA: invite operators into a focused research conversation.

## Layout rules

- Alternate full night and paper fields.
- Keep marketing copy direct and let operational evidence carry the detail.
- Use ruled editorial compositions instead of simulated application workbenches.
- Avoid repeated feature-card grids; give each section a distinct composition and job.
- Give product evidence substantially more room than its supporting copy.
- Stack two-column compositions below 900px and preserve readable workflow states on phones.

## Motion and interaction

Keep the core narrative readable without interaction. Use CSS for hover and focus states on real
controls only, and reserve disclosure behavior for the native FAQ details. Do not add a
smooth-scroll engine, scroll-bound interpolation, or WebGL.

## Asset provenance

The hero photograph, responsive derivatives, CTA texture, and Clarity City font files are existing
repository assets. `public/og-austi.png` is an AI-edited social card derived from that hero
photograph and contains only the Austi name and category statement. Do not add customer logos,
testimonials, avatars, or integration marks until there is honest source material for them.

## Avoid

- Generic AI gradients, glowing agents, glassmorphism, and bento feature grids.
- Fake dashboards with unsupported metrics.
- Quantitative performance claims before real pilots produce evidence.
- Pricing, trials, or product-download language while the work is still in operator research.
