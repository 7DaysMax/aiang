# Design Map

## Spacing Scale

- Base sampling unit: `1px`
- Control spacing: `4px`, `5px`, `6px`, `7px`, `8px`, `9px`, `10px`, `12px`, `14px`
- Grid gutter: `24px`
- Section padding: `96px 24px 64px`

## Font Hierarchy

- Hero: `Inter`, `72px/74.88px`, `500`, `-2.16px`
- Section heading: `Inter`, `16px/24px`, `500`, `-0.16px`
- Body: `Inter`, `13px`, `425`
- Controls: `Inter`, `12px`, `425–500`
- Code: `Geist Mono`, `11px`, `400`

## Color Palette

- Background: `#FFFFFF` — `95.5%` measured surface
- Subtle surface: `#FAFAFA` — `2.3%` measured surface
- Primary text/action: `#1A1A1A`
- Muted text: `#A1A1A1`
- Hairline: `#E6E8EC`
- Success: `#15A06A`

## Image Ratios

- No significant photographic or illustrative images detected
- Component cards: `~1.7:1` to `~2.0:1` from screenshot; DOM card measurement unavailable

## Component Tokens

- Grid: `2 × 604px`, `24px` gutter, `1232px` content width
- Radii: `4px`, `7px`, `10px`, `12px`, `999px`
- Frame shadow: `0 0 0 0.5px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.05), 0 2px 4px rgba(0,0,0,.02)`
- Motion: `150–360ms`, primary easing `cubic-bezier(0.22,1,0.36,1)`
- Interaction: `:focus-visible` and `prefers-reduced-motion` present

---

# Taste DNA

### Quiet surface, concentrated action

- **Trigger**: When an agent interface needs many interactive states without feeling like a control panel.
- **Decision**: They chose a `95.5%` white surface with `#1A1A1A` actions over persistent colored panels.
- **Reason**: People can follow the work itself while the next available action remains unmistakable.
- **Evidence**: `#FFFFFF` occupies `95.5%`; accent surfaces stay below `1%`; `#1A1A1A` leads action colors.

### Hairlines before containers

- **Trigger**: When related controls need a boundary.
- **Decision**: They chose `0.5px` rings and a three-layer low-opacity shadow over heavy borders or elevated cards.
- **Reason**: The boundary is discoverable at rest without competing with typed content.
- **Evidence**: `12px` outer radius, `#E6E8EC` hairlines, black shadow layers at `0.08`, `0.05`, and `0.02` opacity.

### Utility typography over display variety

- **Trigger**: When labels, code, metadata and conversation text share one dense surface.
- **Decision**: They chose Inter at `11–16px` plus Geist Mono for code over a decorative display/body pairing.
- **Reason**: Users scan changing states faster when letterforms stay stable across roles.
- **Evidence**: Inter appears on `848` sampled elements; `13px` dominates; weight `425` is most frequent.

### Motion explains state

- **Trigger**: When menus, chips and enhancement states enter or leave.
- **Decision**: They chose `150–360ms` state transitions with `cubic-bezier(0.22,1,0.36,1)` over ambient decoration.
- **Reason**: Movement tells people what changed and where it went without adding persistent visual noise.
- **Evidence**: Menu `200ms`, chip `260ms`, height `360ms`, plus a reduced-motion branch.
