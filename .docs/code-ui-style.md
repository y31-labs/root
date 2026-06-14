# Code UI Style

These rules apply to the Code desktop app and its shared workbench components.

## Direction

Code uses a quiet, minimal interface. Prefer one continuous page surface with clear typography,
spacing, and dividers over a dashboard made from separate containers.

## Rules

1. **Do not use cards for page layout.** Do not wrap repositories, sessions, forms, status,
   verification, or empty states in `Card` solely to group content.
2. **Build hierarchy with type and space.** Use page titles, section headings, muted supporting
   text, and consistent vertical rhythm before adding decoration.
3. **Separate adjacent content with lines.** Prefer `border-y`, `border-b`, and `divide-y` for
   lists and sections. Keep the page background continuous.
4. **Reserve contained surfaces for true overlays.** Dialogs, popovers, menus, tooltips, and
   transient floating UI may use their standard surface treatment.
5. **Keep status treatment compact.** Use semantic text, icons, and badges. Do not create a
   colored panel when a short inline status communicates the same information.
6. **Use semantic theme tokens only.** Follow `.docs/ui-theming.md`; do not introduce raw palette
   utilities in app source.
7. **Prefer composition over new primitives.** Use semantic HTML and existing shared UI controls.
   Do not add a replacement design-system component to imitate a card without the name.

## Default Section Pattern

```tsx
<section className='space-y-4'>
  <div>
    <h2 className='font-medium'>Section title</h2>
    <p className='text-muted-foreground text-sm'>Short supporting description.</p>
  </div>
  <div className='divide-y border-y'>{/* rows */}</div>
</section>
```

Exceptions should be tied to interaction behavior, not visual grouping.
