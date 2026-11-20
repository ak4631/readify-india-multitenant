# Design - Readify India Partner Portal

A locked design system for the Readify India admin app. Every page should preserve this system and vary only by density or local workflow needs.

## Genre

modern-minimal

## Macrostructure Family

- Marketing pages: Marquee Hero, only if public marketing routes are added.
- App pages: Workbench, with persistent side navigation, compact page headers, dense cards, and scan-friendly tables.
- Content pages: Long Document, typography-first with the same tokens.

## Theme

- `--color-paper` crisp blue-white
- `--color-surface` pure white operational surface
- `--color-ink` deep blue-black
- `--color-muted` cool blue-grey
- `--color-rule` low-contrast blue rule
- `--color-accent` royal blue
- `--color-warning` amber signal

## Typography

- Display: Valley Sans, weight 650, style normal
- Body: Valley Sans, weight 400
- Mono: system monospace, weight 500
- Display tracking: 0
- Type scale anchor: `--text-display`

## Spacing

Use the 4-point named scale in `tokens.css`. App pages should prefer dense vertical rhythm over large editorial gaps.

## Motion

- Easings: `--ease-out`, `--ease-in`, `--ease-in-out`
- Reveal pattern: none for routine app pages
- Reduced-motion fallback: opacity-only, no spatial motion

## Microinteractions Stance

- Silent success
- Focus rings show immediately
- Hover changes should use color, shadow, opacity, or transform only
- Avoid celebratory motion in admin workflows

## CTA Voice

- Primary CTA: royal blue fill, compact, semibold, icon-friendly
- Secondary CTA: white or transparent outline, subtle border

## What Pages Must Share

- Readify India wordmark treatment
- Royal blue accent placement
- Valley Sans font stack
- Compact card and table rhythm
- Focus ring and control radius

## What Pages May Differ On

- Table density
- Header action layout
- Empty state copy
- Local metric layout

## Exports

Use `tokens.css` at the project root as the portable token export.

## Record Lists

- Use a compact table with a visible filter toolbar for listing, booking, order, and service-management collections.
- Show the listing as a column when records span multiple listings; use a listing filter instead of rendering a section per listing.
- Apply search, status, listing, and date filters before database pagination where relevant. Paginate records, not listing groups.
- Preserve filter values in pagination links and reset the page when filters change.
- Keep wide tables scrollable inside their container on mobile. Empty states must remain readable without scrolling.
