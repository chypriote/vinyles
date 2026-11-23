# Vinyles components: "Wall" v1

Sources: [DESIGN.md](DESIGN.md) for the look, [TOKENS.md](TOKENS.md) for values, [CONTEXT.md](CONTEXT.md) for names. Components use only semantic or component tokens.

Accepted by Nico on 2026-11-20.

Stack: SvelteKit (Svelte 5). "Snippet" is a Svelte 5 slot. Props are camelCase; callbacks start with `on`.

## Hierarchy

| Level | Components |
|---|---|
| Primitive | Chip, Button, DesireDots, SearchField, Select, Field |
| Component | Cover, DesireFilter, Tabs, Popup, StoreSelect, EmptyState |
| Pattern | StickyBar, CoverGrid, LoginForm, RecordForm, WishlistItemForm, GotItForm, ConfirmDialog, ImportReview |

Nico accepted the Owner UI, EmptyState and ImportReview sections on 2026-11-20. They add no token: they reuse the tokens above.

## Shared rules

- Touch target: every control is at least 44 × 44px. New component token: `control.size.min` = 44px.
- Focus: `outline.focus.width` in `color.outline.focus`, on `:focus-visible` only.
- Motion: hover tilt and lift only under `prefers-reduced-motion: no-preference`.
- Controls (pills) use `radius.control` and `shadow.raised`. No borders.
- Numbers use `font.numeric`.
- Components set no outer margin and no width. The pattern sets the layout.

---

## Chip

**Hierarchy:** Primitive
**Purpose:** Shows one count or total in the sticky bar.

### Variant Matrix
| Dimension | Type | Values |
|---|---|---|
| tone | enum | `highlight` (sun), `success` (mint), `info` (sky) |

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| tone | `'highlight' \| 'success' \| 'info'` | — | Background: `color.bg.highlight`, `.success` or `.info` |
| label | string | — | Visible text, for example "records" |
| value | string | — | Number, already formatted ("96", "1 604,20 €") |

Text: `color.text.on-chip`, `text.body`, value in extrabold.

### States
Default only. A chip is not interactive.

### Slots
None.

---

## Button

**Hierarchy:** Primitive
**Purpose:** A pill action button.

### Variant Matrix
| Dimension | Type | Values |
|---|---|---|
| intent | enum | `success` (Got it), `neutral` (Drop) |

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| intent | `'success' \| 'neutral'` | `'neutral'` | `success`: `color.bg.success` + `color.text.on-chip`. `neutral`: `color.bg.surface` + `color.text.primary` |
| disabled | boolean | false | Native `disabled` |
| onclick | `() => void` | — | Action |

### States
Default, hover, focus, pressed, disabled.
- Hover: a state layer of the text color at 8%.
- Pressed: shadow goes to 0 and the button moves down 3px (it "sinks" into its offset shadow).
- Disabled: 50% opacity, no shadow.

### Slots
`children`: the label text.

---

## DesireDots

**Hierarchy:** Primitive
**Purpose:** Shows the Desire of a Wishlist Item, 1 to 3.

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| value | `1 \| 2 \| 3` | — | Number of dots |

Dots: `color.icon.accent`. Visually hidden text: "Desire {value} of 3". The dots are `aria-hidden`.

### States
Default only.

---

## SearchField

**Hierarchy:** Primitive
**Purpose:** One search box over artist and album.

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| value | string | `''` | Bindable (`bind:value`) |
| label | string | — | Visually hidden label, for example "Search artist or album" |
| placeholder | string | `''` | |

Native `<input type="search">`. Surface: `color.bg.surface`, text `text.body`.

### States
Default, focus, filled (native clear button shows).

---

## Select

**Hierarchy:** Primitive
**Purpose:** Artist filter and sort choice.

Native `<select>`, styled as a pill. Native gives keyboard, typeahead and the phone picker.

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| value | string | — | Bindable |
| label | string | — | Visually hidden label ("Artist", "Sort by") |
| options | `{ value: string; label: string }[]` | — | |

### States
Default, focus.

---

## Cover

**Hierarchy:** Component
**Purpose:** One Album in the grid: cover image and caption. It opens the Popup.

### Variant Matrix
| Dimension | Type | Values |
|---|---|---|
| desire | optional prop | absent (Collection), 1–3 (Wishlist) |

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| album | string | — | Album title, caption line 1 (`text.caption.album`) |
| artist | string | — | Artist name, caption line 2 (`text.caption.artist`) |
| coverUrl | string \| null | null | Image from R2. Null shows the initials tile |
| desire | `1 \| 2 \| 3` | — | When set, DesireDots show under the caption |
| onSelect | `(el: HTMLElement) => void` | — | Gives the Popup the element to open over |

The whole Cover is one `<button>`. The image has `alt=""`, because the caption names the album. Image: square, `cover.radius`, `loading="lazy"`.

Initials tile: first letters of the first two words of the artist name, in `text.heading.page` weight, color `cover.tile.text`. The background is one of the four `cover.tile.bg` colors. The artist name picks it: sum of the name's character codes, modulo 4. All albums by one artist get the same color.

### States
- Default.
- Hover and focus: `cover.hover.lift` and `cover.hover.tilt`, motion allowed only. Focus also shows the focus ring.
- No cover: initials tile.
- Image load fails: initials tile.

### Slots
None.

---

## DesireFilter

**Hierarchy:** Component
**Purpose:** Filters the Wishlist by Desire.

Three toggle buttons: 3, 2 and 1 dots. Each one uses DesireDots for its face.

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| value | `(1 \| 2 \| 3)[]` | `[]` | Bindable. The pressed desires. Empty = show all |

Each button has `aria-pressed`. Pressed: `color.bg.highlight` and `color.text.on-chip`. Not pressed: `color.bg.surface`. Group label (visually hidden): "Desire".

### States
Default, hover, focus, pressed.

---

## Tabs

**Hierarchy:** Component
**Purpose:** Switches between Collection and Wishlist.

Two links to two routes (`/` and `/wishlist`), not an ARIA tab widget. Each list has its own URL, so a family member can share a link to the Wishlist.

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| current | `'collection' \| 'wishlist'` | — | The link for it gets `aria-current="page"` |

Current: `color.bg.accent` + `color.text.on-accent`. Other: `color.bg.surface` + `color.text.primary`.

### States
Default, hover, focus, current.

---

## Popup

**Hierarchy:** Component
**Purpose:** Shows the details of one Record or Wishlist Item over its Cover.

Native `<dialog>` with `showModal()`. Native gives the focus trap, Esc, the `inert` page and the backdrop (`color.bg.overlay`). On close, focus goes back to the Cover.

### Props API
| Prop | Type | Default | Description |
|---|---|---|---|
| open | boolean | false | Bindable |
| anchor | HTMLElement \| null | null | The Cover. The Popup opens over it, clamped to the screen |
| album | string | — | Title (`text.heading.popup`) |
| artist | string | — | Under the title (`text.body.detail`, muted) |
| coverUrl | string \| null | null | `popup.cover.size` image, or the initials tile |
| onDismiss | `() => void` | — | X button, Esc, tap on the backdrop |

Box: `color.bg.surface`, `popup.radius`, max width `popup.width.max`. The X button is at top right, label "Close" (visually hidden), 44px target.

### States
Open, closed.

### Slots
- `details`: a `<dl>` of rows. Collection: year, variant, acquisition (Purchase: store and price; Gift: from). Wishlist: year, variant, desire (DesireDots), one Price Quote per Store.
- `actions`: optional. Wishlist, Owner only: Button `success` "Got it" and Button `neutral` "Drop". Viewers do not get the snippet.

The page fills the snippets. Popup does not know Records from Wishlist Items.

---

## StickyBar

**Hierarchy:** Pattern
**Purpose:** The top bar of each list.

Order: title (`text.heading.page`), Chips, lock Button (Viewer) or Add Button (Owner), Tabs, SearchField, artist Select, sort Select, DesireFilter (Wishlist only). It wraps to more lines on phone. Background `color.bg.page`, sticky at top.

- Collection: Chip `highlight` record count, Chip `success` total spent. Sorts: artist, album, release year, acquired.
- Wishlist: Chip `info` item count. Sorts: artist, album, release year.

---

## CoverGrid

**Hierarchy:** Pattern
**Purpose:** The wall of Covers.

CSS grid, `grid.columns` per breakpoint, gaps `space.grid.gap-x` and `space.grid.gap-y`, side gutter `space.gutter` plus safe-area insets. Key each Cover by its Record or Wishlist Item id, not by index.

---

## Owner UI

Viewers see only the lock Button. After login, the Owner sees an "Add" Button in its place. Every form opens in Popup with `anchor` null: centered, same box, same X button and Esc. Forms use native inputs and a native `<form>`; the submit Button is `success`, with "Cancel" as `neutral`.

### Field

**Hierarchy:** Primitive
**Purpose:** A labeled native input for forms.

| Prop | Type | Default | Description |
|---|---|---|---|
| value | string | `''` | Bindable |
| label | string | — | Visible label above the input (not hidden, unlike SearchField) |
| type | `'text' \| 'password' \| 'number' \| 'date'` | `'text'` | Native input type |
| required | boolean | false | Native `required` |
| error | string \| null | null | Text under the input, linked with `aria-describedby`, `color.text.primary` with an "!" prefix |

Look is the same as SearchField. States: default, focus, filled, error. Price uses `type="number"` with `step="0.01"` and a visible "€" in the label.

### StoreSelect

**Hierarchy:** Component
**Purpose:** Pick a Store, or add a new one.

Native Select over the Stores, plus a last option "Add a store…". That option shows a Field for the new name and an "Add" Button. The new Store joins the list at once.

| Prop | Type | Default | Description |
|---|---|---|---|
| value | string | — | Bindable store id |
| stores | `{ id: string; name: string }[]` | — | |
| onAddStore | `(name: string) => Promise<{ id: string }>` | — | |

### LoginForm

One password Field, one `success` Button "Log in". Wrong password: Field `error` "Wrong password". It opens in Popup from a lock icon Button at the top right of the StickyBar, right after the Chips (after total spent on the Collection). The icon has a visually hidden label "Owner login". There is no "owner only" text.

### RecordForm

Fields: Artist (Field, with the existing artists as native `<datalist>`), Album (Field), Variant (Field, optional), Acquisition (two radio pills: Purchase, Gift), Date (Field `date`). Purchase shows StoreSelect and Price. Gift shows "From" (Field, optional). Edit mode fills the values and adds a `neutral` Button "Delete record", which opens ConfirmDialog. Release year and cover come from the lookup on save.

### WishlistItemForm

Fields: Artist, Album, Variant (optional), Desire (three radio pills, 3, 2, 1 dots, each with DesireDots as its face), Price quotes (rows of StoreSelect + Price, "Add a quote" Button). If the Album is already a Record: a notice "Already owned" with a "Add anyway" Button before the form saves.

### GotItForm

Opens from the "Got it" Button. Same Acquisition fields as RecordForm. Save removes the Wishlist Item and creates the Record.

### ConfirmDialog

Popup with a title, one line of text, a `neutral` Button "Cancel" and a `success` Button as the action. Used only for Delete record ("Delete {album}?"), with the action Button "Delete". Drop acts at once, with no confirmation.

### EmptyState

**Hierarchy:** Component
**Purpose:** Fills the grid area when a list has no Cover.

| Prop | Type | Default | Description |
|---|---|---|---|
| message | string | — | `text.body`, centered, for example "No record matches your search" |
| action | snippet | — | Optional. Owner only: an "Add" Button on an empty list |

Three cases: empty Collection ("No records yet"), empty Wishlist ("Nothing on the wishlist"), no match for the search or filters ("No match", with a "Clear filters" Button). No illustration.

### ImportReview

**Hierarchy:** Pattern
**Purpose:** The one-time import screen. Owner only, route `/import`.

1. One `success` Button "Import from the sheet". While it runs, text shows the count: "Imported 40 of 96".
2. After it, a list of the albums with no MusicBrainz match: artist, album, and a Field "Release year" per row. A Cover in the initials tile shows if no cover was found.
3. A `success` Button "Save years" stores the typed years and ends the review.

The route is removed from the app once the sheet is retired.

---

## Governance note

One owner, no Figma library, no ticket tool. The contribution steps reduce to: Nico accepts this file, then the code follows it. Versioning starts when the first component ships.
