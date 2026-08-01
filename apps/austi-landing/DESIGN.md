---
name: Austi
description: "An app that'll make you question your job."
colors:
  night-office: "#0a0a0a"
  paper: "#eeece5"
  paper-bright: "#f8f6ef"
  paper-recessed: "#e7e4dc"
  ink: "#11110f"
  chalk: "#f6f3eb"
  muted-night: "#aaa8a1"
  muted-paper: "#66645f"
  line-night: "rgb(246 243 235 / 15%)"
  line-paper: "rgb(17 17 15 / 18%)"
  payroll: "#ff4f42"
  payroll-hover: "#ff655b"
  payroll-paper: "#c2352d"
  payroll-ink: "#130604"
  signal: "#dfff57"
  local: "#278a51"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(4.5rem, 6.7vw, 6.9rem)"
    fontWeight: 550
    lineHeight: 0.88
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 82"
  headline:
    fontFamily: "Bricolage Grotesque Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(3.6rem, 7vw, 7.1rem)"
    fontWeight: 550
    lineHeight: 0.93
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Bricolage Grotesque Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(1.9rem, 3vw, 3rem)"
    fontWeight: 610
    lineHeight: 1
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 680
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "0.45rem"
  control: "0.55rem"
  button: "0.65rem"
  surface: "0.8rem"
  permission: "0.85rem"
  pill: "999px"
  round: "50%"
spacing:
  xs: "0.45rem"
  sm: "0.75rem"
  md: "1.2rem"
  lg: "1.5rem"
  xl: "2rem"
  page-gutter: "clamp(1.15rem, 3vw, 3.4rem)"
  workbench-gap: "clamp(1.2rem, 3vw, 3rem)"
  section-y: "clamp(7rem, 12vw, 13rem)"
components:
  navigation:
    backgroundColor: "{colors.night-office}"
    textColor: "{colors.chalk}"
    typography: "{typography.label}"
    rounded: "0"
    padding: "0 {spacing.page-gutter}"
    height: "5.5rem"
  header-download:
    backgroundColor: "{colors.payroll}"
    textColor: "{colors.payroll-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 1rem"
    height: "2.65rem"
  button-primary:
    backgroundColor: "{colors.payroll}"
    textColor: "{colors.payroll-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 1rem"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.payroll-hover}"
    textColor: "{colors.payroll-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 1rem"
    height: "3rem"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "2.8rem"
  button-neutral:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "3rem"
  stage-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted-paper}"
    typography: "{typography.title}"
    rounded: "0"
    padding: "1.2rem clamp(0.9rem, 2vw, 2rem)"
    height: "7.6rem"
  stage-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chalk}"
    typography: "{typography.title}"
    rounded: "0"
    padding: "1.2rem clamp(0.9rem, 2vw, 2rem)"
    height: "7.6rem"
  request-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.button}"
    padding: "1.2rem 3.5rem 2.5rem 1.2rem"
    height: "9.2rem"
  planner-window:
    backgroundColor: "{colors.paper-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  status-chip:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.45rem"
  permission-sheet:
    backgroundColor: "{colors.paper-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.permission}"
---

# Design System: Austi

## Overview

**Creative North Star: "Night Shift Performance Review"**

Austi is after-hours workplace software: matte, dry, exact, and a little confrontational. Near-black office fields and fluorescent warm paper alternate like a darkened floor and the documents left on its desks. Enormous compressed headlines carry the joke; ruled native-software evidence carries the proof.

The system makes intelligence tangible without making it theatrical. It surrounds dense, credible interfaces with severe whitespace, uses payroll red to mark agency and acid yellow to mark exceptional state, and keeps the rest in disciplined ink, chalk, and paper. The visual anti-reference is the cheerful app-generator hero: no optimistic gradient cloud, decorative AI glow, or friendly card mosaic.

**Key Characteristics:**

- Matte near-black fields alternating with fluorescent warm paper.
- Oversized, compressed Bricolage statements beside precise Inter evidence.
- Payroll red for action, emphasis, and the one human interruption.
- Acid yellow used only for exceptional state or a changed fact.
- Native-software windows and workplace documents built from ruled rows.
- Sparse marketing space surrounding dense, credible operational detail.

## Colors

The palette behaves like an office after closing: black architecture, paper under fluorescent light, and two deliberately unnatural signals.

### Primary

- **Payroll Red** (`payroll`, `#ff4f42`): the principal action color, brand tile, progress edge, active work state, and short emphasis on night fields.
- **Payroll Hover** (`payroll-hover`, `#ff655b`): the controlled hover lift for payroll-filled actions.
- **Payroll Paper** (`payroll-paper`, `#c2352d`): red text on warm paper. It is the contrast-safe paper-surface red, reaching 4.63:1 on Paper and 5.06:1 on Bright Paper.
- **Payroll Ink** (`payroll-ink`, `#130604`): near-black content placed on bright payroll fills.

### Secondary

- **Acid Status** (`signal`, `#dfff57`): changed rows, exceptional revision state, and tightly bounded permission metadata. It is never an ambient background.

### Tertiary

- **Local Green** (`local`, `#278a51`): saved-local and completed state inside paper software only.

### Neutral

- **Night Office** (`night-office`, `#0a0a0a`): the dominant dark field, page chrome, and browser theme color.
- **Fluorescent Paper** (`paper`, `#eeece5`): the warm document field used for explanatory sections and request surfaces.
- **Bright Paper** (`paper-bright`, `#f8f6ef`): software windows, dialogs, and raised document interiors.
- **Recessed Paper** (`paper-recessed`, `#e7e4dc`): native-software sidebars and recessed navigation regions.
- **Document Ink** (`ink`, `#11110f`): primary content and controls on paper.
- **Night Chalk** (`chalk`, `#f6f3eb`): primary content on night.
- **Muted Night** (`muted-night`, `#aaa8a1`): secondary copy and navigation on dark fields.
- **Muted Paper** (`muted-paper`, `#66645f`): metadata, inactive controls, and explanatory copy on paper.
- **Night Rule** (`line-night`, `rgb(246 243 235 / 15%)`): structural hairlines on night.
- **Paper Rule** (`line-paper`, `rgb(17 17 15 / 18%)`): structural hairlines inside paper fields and software.

### Named Rules

**The Two Payroll Reds Rule.** Use bright Payroll Red for fills and short emphasis on night; use Payroll Paper for text on warm paper.

**The Acid Exception Rule.** Acid Status marks a consequential exception or changed fact. Never spend it on decoration, section atmosphere, or routine success.

**The Field Owns the Contrast Rule.** Night uses chalk and Muted Night; paper uses ink and Muted Paper. Do not carry a muted token across fields by habit.

## Typography

**Display Font:** Bricolage Grotesque Variable (with Arial Narrow and sans-serif fallbacks)
**Body Font:** Inter Variable (with Inter, system UI, and sans-serif fallbacks)
**Label Font:** Inter Variable

**Character:** Bricolage is compressed, blunt, and editorial enough to make a performance-review headline feel authored rather than promoted. Inter handles interface state, evidence, and small operational language without competing for attention.

### Hierarchy

- **Display** (550, `clamp(4.5rem, 6.7vw, 6.9rem)`, 0.88 line-height, width axis 82): the most provocative brand statement; keep it under roughly nine characters per line where composition permits.
- **Headline** (550, `clamp(3.6rem, 7vw, 7.1rem)`, 0.93 line-height): section theses and closing statements with severe leading and balanced wrapping.
- **Title** (610, `clamp(1.9rem, 3vw, 3rem)`, 1 line-height): authoring scenes, document prompts, and important software headings.
- **Body** (400, `1rem`, 1.5 line-height): foundational reading text; explanatory paragraphs may open to 1.55–1.65 and stay near 34–37rem.
- **Label** (680, `0.72rem`, 1.5 line-height): actions, table metadata, states, and control descriptions. Labels remain sentence case.

### Named Rules

**The Two Voices Rule.** Bricolage delivers judgment and names the work; Inter records what happened, who owns it, and what the software will do.

**The Compression Does the Shouting Rule.** Build impact with scale, width, tight leading, and negative tracking—not with ultra-bold weight or all caps.

## Layout

The system uses a very wide editorial field capped at 110rem, with a fluid gutter of 1.15–3.4rem and section spacing of 7–13rem. Page regions alternate full night and paper fields. Inside them, composition stays asymmetric: a decisive text column is paired with a larger evidence column, while horizontal rules and open space organize the page without layout cards.

Operational density belongs inside the evidence. Product workbenches use a narrower authoring or context pane beside a wider software pane, typically with a 1.2–3rem gap. Tables, ledgers, permission rows, and sidebars use compact internal increments from 0.45–2rem; the surrounding marketing space remains deliberately sparse.

At 1180px, sidebars and table columns compress, and lower-priority blocker data is removed. At 900px, two-column marketing and proof layouts stack, navigation links hide, the product-stage rail becomes horizontally scrollable, and the active stage swaps between authoring and app evidence. At 640px, the gutter becomes 1rem, actions stack, software tables reduce to task and status, secondary app chrome disappears, permission rows stack, and full-width evidence may run to the viewport edge.

**The Office-to-Document Rule.** Large fields create atmosphere; rules, rows, and bounded documents carry information. Do not replace that relationship with a uniform grid of panels.

**The Evidence Gets the Room Rule.** When text and software share a row, the software is the larger object. At narrow widths, stack the proof without shrinking it into an unreadable thumbnail.

## Elevation & Depth

The system is flat until physical separation matters. Most hierarchy comes from field changes, one-pixel rules, recessed paper, and density. Shadows are reserved for a major software window floating over night, a permission sheet that must read as an authority boundary, and the hover lift of a primary action.

### Shadow Vocabulary

- **Hero Software** (`0 2.8rem 6rem rgb(0 0 0 / 36%)`): the largest software artifact when it rises over the night field.
- **Authority Sheet** (`0 3rem 7rem rgb(0 0 0 / 45%)`): the strongest depth, reserved for a permission decision on night.
- **Payroll Hover** (`0 0.75rem 1.8rem rgb(255 79 66 / 18%)`): a short red-tinged lift that appears only while a primary action is hovered.

### Named Rules

**The Earned Elevation Rule.** If a surface is not floating over another field, awaiting a consequential decision, or reacting to direct input, it stays shadowless.

## Shapes

The form language is rectilinear workplace software softened only where an object needs to be grasped or recognized. Major software windows use a 0.8rem radius, the permission sheet uses 0.85rem, primary controls use 0.65rem, and compact native controls settle around 0.45–0.55rem. Pills and circles belong to status, people, window chrome, and icon controls—not to page sections.

Hairlines are structural, not ornamental. They divide table rows, app chrome, stage controls, trust notes, revision documents, and full-width page regions. The only spatial irregularity is a subtle perspective tilt on the largest software window; ordinary documents remain square to the page.

**The Rounded Object Rule.** Round a control, app window, or status token because it is a discrete object. Never round the page into a collection of interchangeable cards.

## Components

### Buttons

- **Shape:** compact, dense controls with 0.55–0.65rem corners and no pill-shaped primary action.
- **Primary:** Payroll Red with Payroll Ink, a 3rem minimum height, 1rem horizontal padding, and a weighty Inter label. The persistent header version compresses to 2.65rem; the final download action expands to 3.8rem.
- **Hover / Focus:** primary controls brighten to Payroll Hover, rise 2px, and receive the Payroll Hover shadow over 160ms. Keyboard focus is always a 2px Payroll Red outline with a 4px offset.
- **Neutral / Ink:** permission choices pair a transparent, paper-ruled neutral control with an ink-filled decisive control. The decisive control may turn Payroll Red on hover.

### Chips

- **Style:** small, fully rounded, and state-bearing. Acid Status marks an exceptional change or one-action scope; restrained paper neutrals carry routine blockers and progress counts.
- **State:** use a small green dot for saved-local or completed state. Do not use green as a marketing accent.

### Cards / Containers

- **Corner Style:** software windows use 0.8rem corners; permission sheets use 0.85rem; workbench panes and ruled ledgers may remain square.
- **Background:** Bright Paper for foreground software, Fluorescent Paper for request or document fields, and Recessed Paper for sidebars.
- **Shadow Strategy:** follow the earned elevation vocabulary; most paper containers are flat and separated by rules.
- **Border:** Paper Rule divides internal rows; Night Rule divides dark-field regions.
- **Internal Padding:** 1.2–2rem for software content, with 0.45–0.9rem for controls and metadata.

### Request Cards

- **Style:** an illustrative multiline request on Fluorescent Paper, set in Bricolage with a Paper Rule border, 0.65rem corners, and a circular Payroll send control in the lower-right corner.
- **Behavior:** the card is evidence, not a live text input. Do not imply editability with a caret, placeholder, or focus state.

### Navigation

- **Header:** a thin 5.5rem night bar with the Austi mark at left, quiet Inter links centered, and one persistent Payroll download action at right. At 900px the links disappear; at 640px the bar compresses to 4.5rem.
- **Stage Controller:** four equal ruled cells use Bricolage names and small Inter explanations. The active cell reverses to ink and chalk, while a 3px Payroll edge records autoplay progress. On small screens it scrolls horizontally and stays before the pane it controls.

### Planner Window

The signature software surface combines minimal macOS-like chrome, Bright Paper, ruled rows, compact Inter metadata, and Bricolage titles. Sidebars use Recessed Paper; status is carried by dots, small pills, and plain text. The largest instance may use a restrained perspective transform, while embedded workbench instances stay flat.

### Revision Ledger

The revision pattern pairs a single request with a ruled paper ledger. A changed row receives a translucent Acid Status wash, the previous value remains visibly struck through, the replacement value uses Local Green, and preserved rows remain visually unchanged.

### Permission Sheet

The permission sheet is a compact native decision surface. It exposes app identity, operation, data, destination, and duration in ruled definition rows, then presents an equally legible local alternative and one decisive approval action. Result states disable the original choices and keep a visible reset path.

## Do's and Don'ts

### Do:

- Do alternate matte Night Office and fluorescent paper fields to establish the world.
- Do place enormous compressed statements beside or above near-life-size software evidence.
- Do use Payroll Red for action and human emphasis, Payroll Paper for readable red text on paper, and Acid Status only for exceptional state.
- Do organize software, revisions, and authority with rows, hairlines, and explicit labels.
- Do keep operational detail compact while the surrounding composition stays sparse.
- Do preserve semantic controls, visible Payroll focus outlines, the mobile stage swap, and the reduced-motion fallback.

### Don't:

- Don't introduce cheerful AI gradients, glassmorphism, ambient neon, or decorative glow.
- Don't turn the page into a grid of rounded marketing cards or floating feature tiles.
- Don't let acid yellow or local green become general-purpose accent colors.
- Don't use the bright Payroll Red for text on warm paper; use Payroll Paper.
- Don't fake impact with all caps, ultra-bold display type, or dense supporting copy.
- Don't rasterize product evidence or make illustrative request cards look editable.
