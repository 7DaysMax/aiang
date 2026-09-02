# Design Map

## Spacing Scale

- Base unit: 2px
- Interface rhythm: 4px, 6px, 8px, 10px, 12px
- Structural rhythm: 16px, 24px, 32px, 40px, 64px

## Font Hierarchy

- Page title: Inter 21px / 600 / 28.875px
- Section title: Inter 13px / 600 / 19.5px
- Interface: Inter 12.5–13px / 500
- Body: Inter 11.5px / 400 / 17.25px
- Data and code: JetBrains Mono 10.5–12px / 400

## Color Palette

- Page: `#1B1C1E`
- Surface: `#232427`
- Field: `#2B2C2F`
- Primary text: `#F2F3F4`
- Secondary text: `#A5A8AD`
- Muted text: `#6C6F75`
- Accent: `#7EC0FF`

## Image Ratios

- Logo: 0.98:1
- Source avatars: 1:1

## Component Tokens

- Radius: 4px, 6px, 7px, 8px, 10px, 14px, 999px
- Grid: 960px; `288px minmax(0, 672px)`; 32px gutter
- Card depth: 1px light-alpha ring + 1–6px black shadow stack
- Overlay depth: 1px light-alpha ring + 8px/28px black shadow
- Motion: 100–400ms; `cubic-bezier(0.23, 1, 0.32, 1)`

---

# Taste DNA

### Working specimen over marketing frame

- **Trigger**: When presenting an interface primitive.
- **Decision**: Chose a live, centered interaction specimen over decorative product imagery.
- **Reason**: Builders need to judge state changes and density before they need persuasion.
- **Evidence**: 20 interactive sections, only logo/source-avatar imagery, and a 672px specimen column.

### Boundaries over floating layers

- **Trigger**: When separating dense controls and data.
- **Decision**: Chose cool hairline rings and surface shifts over broad drop shadows.
- **Reason**: A flat tool surface lets state and content carry attention without making every control feel raised.
- **Evidence**: `#232427` surface, `#2B2C2F` field, 1px light-alpha rings, and an 8px dominant radius.

### Compact comparison rhythm

- **Trigger**: When fitting many component states into one catalogue.
- **Decision**: Chose an 11.5–13px interface scale on a 2px spacing base over large editorial type and wide pauses.
- **Reason**: People can compare more states without losing the label-to-control relationship.
- **Evidence**: 496 elements at 13px, 223 spacing samples at 4px, 196 at 8px, and 40px section padding.

### One cool signal

- **Trigger**: When emphasis is needed across tools, status, and navigation.
- **Decision**: Chose one blue accent on a small share of the surface over a multi-accent brand palette.
- **Reason**: A single signal remains meaningful when green, orange, and red are reserved for outcomes.
- **Evidence**: `#7EC0FF` accent, six dominant cool-neutral tokens, and no accent-colored large surface.
