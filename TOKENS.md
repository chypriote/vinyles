# Vinyles tokens: "Wall"

Source of truth: [DESIGN.md](DESIGN.md). This file puts its values into three tiers: Primitive → Semantic → Component. Component code uses only semantic or component tokens, never a primitive.

Modes: light and dark swap the semantic → primitive bindings. Primitives stay the same in both modes. The system theme picks the mode; `data-theme` overrides it.

## Primitives

### Color

| Token | Value | Notes |
|---|---|---|
| color.white | #ffffff | |
| color.cream.50 | #fff3e2 | |
| color.cream.100 | #fff3df | |
| color.cream.200 | #f0dfc2 | |
| color.navy.300 | #a3b1d9 | |
| color.navy.600 | #637090 | |
| color.navy.700 | #2a3a6e | |
| color.navy.800 | #1a2f6b | |
| color.navy.900 | #19254d | |
| color.navy.950 | #101a3a | |
| color.coral.400 | #ff6f63 | |
| color.coral.500 | #ff5a4e | |
| color.coral.600 | #f5523f | |
| color.sun.400 | #ffc83d | |
| color.mint.400 | #34d3a0 | |
| color.sky.400 | #5aa9ff | |
| color.sky.600 | #258dff | |
| color.scrim | rgb(10 18 50 / .75) | Overlay |
| color.shadow | rgb(26 47 107 / .12) | navy.800 at 12% |

### Typography

| Token | Value |
|---|---|
| font.family.base | Nunito, ui-rounded, system-ui, sans-serif |
| font.weight.medium | 500 |
| font.weight.bold | 700 |
| font.weight.extrabold | 800 |
| font.size.2xs | 11px |
| font.size.xs | 12px |
| font.size.sm | 14px |
| font.size.md | 15px |
| font.size.lg | 22px |
| font.size.xl | 24px |
| font.numeric | tabular-nums |

### Space, radius, shadow, size

| Token | Value |
|---|---|
| space.200 | 8px |
| space.300 | 12px |
| space.400 | 16px |
| radius.md | 14px |
| radius.xl | 28px |
| radius.full | 999px |
| shadow.offset.sm | 0 3px 0 {color.shadow} |
| size.outline.md | 3px |

### Layers (z-index)

| Token | Value | Used for |
|---|---|---|
| layer.sticky | 10 | StickyBar |
| layer.safe-area | 20 | Page-color strip over the top safe-area inset, above the StickyBar |

The Popup is a native `<dialog>` in the top layer, so it has no z-index.

### Breakpoints

| Token | Value |
|---|---|
| breakpoint.sm | 640px |
| breakpoint.md | 900px |
| breakpoint.lg | 1200px |

## Semantic bindings

### Color

| Semantic token | Light → | Dark → | Used for |
|---|---|---|---|
| color.bg.page | cream.100 | navy.950 | Page background |
| color.bg.surface | white | navy.900 | Popup, inputs |
| color.text.primary | navy.800 | cream.50 | Ink |
| color.text.muted | navy.600 | navy.300 | Artist caption |
| color.border.subtle | cream.200 | navy.700 | "line" |
| color.bg.accent | coral.500 | coral.400 | Active tab pill |
| color.text.on-accent | navy.950 | navy.950 | Text on accent |
| color.icon.accent | coral.600 | coral.400 | Desire dots |
| color.bg.highlight | sun.400 | sun.400 | Record count chip, pressed desire filter |
| color.bg.success | mint.400 | mint.400 | Total spent chip, Got it |
| color.bg.info | sky.400 | sky.400 | Wishlist count chip |
| color.text.on-chip | navy.800 | navy.800 | Text on sun, mint, sky |
| color.outline.focus | sky.600 | sky.400 | Focus ring |
| color.bg.overlay | scrim | scrim | Behind the popup |

### Type roles

| Semantic token | Size → | Weight → | Color → |
|---|---|---|---|
| text.heading.page | font.size.xl | extrabold | text.primary |
| text.heading.popup | font.size.lg | extrabold | text.primary |
| text.caption.album | font.size.xs | extrabold | text.primary |
| text.caption.artist | font.size.2xs | medium | text.muted |
| text.body | font.size.sm | medium | text.primary |
| text.body.detail | font.size.md | medium | text.primary |

### Shape, depth, space

| Semantic token | → Primitive |
|---|---|
| radius.control | radius.full |
| shadow.raised | shadow.offset.sm |
| outline.focus.width | size.outline.md |
| space.gutter | space.400 |
| space.grid.gap-x | space.200 |
| space.grid.gap-y | space.300 |

## Component tokens

Only where the semantic default is not enough.

| Token | → Value or semantic | Scope |
|---|---|---|
| cover.radius | radius.md | Cover |
| cover.tile.bg | bg.highlight, bg.success, bg.info, bg.accent (in this order) | Initials tile, picked by artist |
| cover.tile.text | text.on-accent | Initials tile, 5.5:1 or more on all four |
| cover.hover.lift | -3px (translateY) | Cover, motion allowed only |
| cover.hover.tilt | -1.5deg (rotate) | Cover, motion allowed only |
| popup.radius | radius.xl | Popup |
| popup.width.max | 420px | Popup |
| popup.cover.size | 150px | Popup |
| control.size.min | 44px | All controls (touch target) |
| grid.columns | 3; 5 from breakpoint.sm; 7 from breakpoint.md; 8 from breakpoint.lg | Cover grid |

Tabs, search, selects, chips and buttons use `radius.control`. Chips and buttons use `shadow.raised`.

## Flags

### Contrast (WCAG 2.2 AA)

All pairs pass in both modes. Light mode:

| Pair | Ratio | Needs |
|---|---|---|
| text.on-accent on bg.accent | 5.54 | 4.5 (text) |
| outline.focus on bg.page | 3.02 | 3 (focus ring) |
| icon.accent on bg.page | 3.11 | 3 (non-text) |
| text.muted on bg.page | 4.50 | 4.5 (text) |

## Line height, dark shadow, motion

Accepted by Nico on 2026-11-20.

### Primitives

| Token | Value | Notes |
|---|---|---|
| font.line-height.tight | 1.15 | Headings |
| font.line-height.snug | 1.25 | Captions: two short lines per cover |
| font.line-height.normal | 1.45 | Body, popup details, form text |
| color.shadow.dark | rgb(0 0 0 / .35) | navy at 12% does not show on navy |
| shadow.offset.sm.dark | 0 3px 0 {color.shadow.dark} | |
| duration.fast | 80ms | Button press |
| duration.base | 150ms | Cover lift and tilt, hover state layer |
| easing.out | cubic-bezier(.2, .8, .2, 1) | |

### Semantic bindings

| Semantic token | Light → | Dark → |
|---|---|---|
| shadow.raised | shadow.offset.sm | shadow.offset.sm.dark |
| motion.hover | duration.base + easing.out | same |
| motion.press | duration.fast + easing.out | same |

Type roles get a line height: headings `tight`, captions `snug`, body and details `normal`.

Under `prefers-reduced-motion: reduce`, there is no transition: the state changes at once and the cover does not move.
