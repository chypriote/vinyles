# Vinyles design language: "Wall"

Theme: happy, round, packed. A full wall of record covers. Dials: Creativity=Balanced, Density=Packed, Variance=Uniform, Motion=Static (hover tilt only).

Never use purple, hard borders, mono type or the muted cream look. Nico rejected them.

## Color tokens

| Token | Light | Dark |
|---|---|---|
| bg | #fff3df | #101a3a |
| surface | #ffffff | #19254d |
| ink | #1a2f6b | #fff3e2 |
| muted | #637090 | #a3b1d9 |
| line | #f0dfc2 | #2a3a6e |
| accent (coral) | #ff5a4e | #ff6f63 |
| on-accent | #101a3a | #101a3a |
| desire dots | #f5523f | #ff6f63 |
| focus ring | #258dff | #5aa9ff |

- Chips: sun #ffc83d (record count), mint #34d3a0 (total spent, Got it), sky #5aa9ff (wishlist count). Chip text is always #1a2f6b.
- All text and focus pairs pass WCAG 2.2 AA. Token tiers: [TOKENS.md](TOKENS.md).
- Overlay: rgb(10 18 50 / .75).
- Shadow base: rgb(26 47 107 / .12).
- Follow the system theme. `data-theme` overrides it.

## Type

Nunito (Google Fonts), weights 500, 700, 800. Fallback: ui-rounded, system-ui. Numbers use tabular-nums.

| Role | Size / weight |
|---|---|
| h1 | 24 / 800 |
| Popup title | 22 / 800 |
| Caption, album | 12 / 800 |
| Caption, artist | 11 / 500, muted |
| Body | 14 / 500 |
| Popup details | 15 / 500 |

## Shape and depth

- Covers: 14px radius. Popup: 28px radius.
- Tabs, search, selects, chips, buttons: pill (999px).
- Depth is a soft offset shadow (0 3px 0), not a blur.
- Hover or focus on a cover: lift 3px and tilt -1.5deg, only when motion is allowed.
- Focus ring: 3px, focus ring color.

## Layout

- Grid: 3 columns on phone, 5 from 640px, 7 from 900px, 8 from 1200px. Gap 8px across, 12px down. Side gutter 16px plus safe-area insets.
- Sticky bar: title, chips (collection: record count and total spent; wishlist: item count), tab pills (Collection, Wishlist), search, artist select, sort select, wishlist desire filter (3, 2, 1 dots; pressed = sun).
- Sorts: artist, album, release year, acquired (collection only).
- Caption under each cover: album title (bold), then artist (muted). Wishlist adds desire dots in the accent color. No year in the caption.

## Components

- **Cover:** square, real album art from the first import. If none is found: a flat tile with the artist initials.
- **Popup:** opens over the tapped cover, clamped to the screen. Max width 420px, cover 150px, X button at top right. Tap outside or Esc closes it.
  - Collection: year, variant, acquisition (purchase: store and price; gift: from).
  - Wishlist: year, variant, desire, price quote per store, pill buttons Got it (mint) and Drop.
- No "owner only" text in the UI.

## Not decided

Nothing for the look. Line heights, dark-mode shadow, motion timing and the initials tile colors are in [TOKENS.md](TOKENS.md).

Owner UI, empty states and import screen: see [COMPONENTS.md](COMPONENTS.md).
