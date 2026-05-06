# UI Theming (Trading App)

This document covers the theming conventions for the trading app (`apps/trading`).

The app follows the [shadcn/ui theming conventions](https://ui.shadcn.com/docs/theming). Colors, radii, and other theme values are defined as CSS variables in `apps/trading/src/styles.css` and exposed to Tailwind through `@theme inline`, so semantic utilities like `bg-background`, `text-foreground`, `border-border`, `bg-success`, `text-danger`, and `rounded-lg` work out of the box.

## Overview

- The app is **dark-mode-only**. There is no light theme or theme switcher.
- The canonical source of truth is `apps/trading/src/styles.css`.
- All tokens are declared once in `:root` with dark-mode values.
- The `@theme inline` block aliases each `--token` to a Tailwind-consumable `--color-token`/`--radius-*` name.
- We use the `new-york` style and `neutral` base (see `apps/trading/components.json`). Do not change these without a follow-up migration.

## Token Reference

### Surface tokens (pair background + foreground)

- `background` / `foreground` — page shell and default text.
- `card` / `card-foreground` — elevated surfaces (Card component, panels).
- `popover` / `popover-foreground` — floating surfaces (Popover, DropdownMenu, HoverCard, ContextMenu).
- `primary` / `primary-foreground` — high-emphasis actions and brand surfaces. Default button fill.
- `secondary` / `secondary-foreground` — lower-emphasis filled actions and supporting surfaces.
- `muted` / `muted-foreground` — subtle surfaces; use `text-muted-foreground` for descriptions, helper text, placeholders, neutral/"flat" state.
- `accent` / `accent-foreground` — interactive hover/active surfaces (ghost button hover, menu item highlights).
- `destructive` / `destructive-foreground` — destructive **actions** (shadcn Button `variant="destructive"`, invalid form states, destructive menu items).

### Control tokens

- `border` — default borders and separators.
- `input` — form control borders and input surface treatment.
- `ring` — focus rings and outlines.

### Chart palette

- `chart-1` … `chart-5` — default chart palette for recharts via `ChartContainer`.

### Sidebar scope

- `sidebar` / `sidebar-foreground`
- `sidebar-primary` / `sidebar-primary-foreground`
- `sidebar-accent` / `sidebar-accent-foreground`
- `sidebar-border`
- `sidebar-ring`

These mirror the global tokens but let the sidebar maintain its own surface/emphasis without affecting the rest of the app.

### Project semantic tokens (trading signal)

Added on top of the shadcn defaults:

- `success` / `success-foreground` — bullish / positive / healthy state.
- `warning` / `warning-foreground` — caution / pending / degraded state.
- `danger` / `danger-foreground` — bearish / negative / error state.

**Signal → token mapping** (use this consistently across price deltas, indicator status dots, sentiment badges, P&L):

- up / positive / bullish → `success`
- down / negative / bearish → `danger`
- caution / pending / "slow down" → `warning`
- neutral / flat / unknown → `muted-foreground`

Examples:

```tsx
<span className="text-success">+1.24%</span>
<span className="text-danger">-0.87%</span>
<span className="bg-success size-1.5 rounded-full" />
<Badge className="bg-warning text-warning-foreground">Delayed</Badge>
```

For recharts or any inline `fill`/`stroke` prop, reference the raw variable:

```tsx
<Area stroke="var(--success)" fill="var(--success)" />
```

### `destructive` vs `danger`

Both currently render as red, but they are semantically distinct and may diverge in value later:

- `destructive` — the user is about to **do** something destructive (delete account, remove item, cancel order). Reserved for button variants and confirmation UI.
- `danger` — something **is** in a negative state that the user is observing (price going down, negative sentiment, error badge on a row).

Rule of thumb: if it's an action verb, use `destructive`. If it's a status/value, use `danger`.

## Radius Scale

`--radius` is the single source of truth. All other radii derive from it multiplicatively, matching the current shadcn scale:

```css
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);
--radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
```

Change `--radius` in `:root` to rescale the whole app.

## Conventions

1. **Never use raw Tailwind color classes in app code.** Forbidden in `apps/trading/src/**` (except `apps/trading/src/components/ui/`): `emerald-*`, `red-*`, `green-*`, `rose-*`, `amber-*`, `yellow-*`, `blue-*`, `sky-*`, `slate-*`, `zinc-*`, `gray-*`, `orange-*`, etc. Use semantic tokens instead.
2. **Pair surface + foreground.** When you use `bg-X`, also use `text-X-foreground` (e.g. `bg-success text-success-foreground`, `bg-warning text-warning-foreground`). Exception: when the background is transparent/subtle (e.g. `bg-success/10`) you can freely pair with `text-success`.
3. **`apps/trading/src/components/ui/` is off-limits.** Those are shadcn primitives and are treated as read-only (see `apps/trading/AGENTS.md`). If you need custom behavior, wrap them elsewhere.
4. **Charts/recharts and any inline `style`/`fill`/`stroke` props** use raw CSS variables: `var(--success)`, `var(--muted-foreground)`, etc. Not Tailwind utilities.
5. **Dark-mode-only.** The app has no light theme. Do not add `dark:*` Tailwind variants or `.dark` CSS blocks — they are unnecessary. All token values in `:root` already target dark mode.

## Adding a New Token

1. Declare the CSS variable in `:root` inside `apps/trading/src/styles.css`:

   ```css
   :root {
     --info: oklch(0.72 0.16 230);
     --info-foreground: oklch(0.141 0.005 285.823);
   }
   ```

2. Expose it to Tailwind inside the `@theme inline { … }` block:

   ```css
   --color-info: var(--info);
   --color-info-foreground: var(--info-foreground);
   ```

3. Document it in the token reference above and note the intended use case.
4. It's now usable as `bg-info`, `text-info`, `border-info`, etc.

## Future Work (out of scope for now)

- A shared `<Tone>` / `<SignalBadge>` primitive to collapse the repeated `tone === 'success' | 'danger' | 'neutral'` switch logic across `indicators-card.tsx`, `news-feed-card.tsx`, `price-hero.tsx`, and `watchlist-panel.tsx`.
- Divergence of `destructive` and `danger` values (currently they look alike; consider a slightly less saturated `danger` for dense data tables).
