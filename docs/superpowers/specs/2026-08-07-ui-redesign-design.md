# OnCall AI — "Clinical Lab Report" design system

Decided 2026-08-07. Direction: clinical light lab report — the product produces a
verifiable record, so the UI looks like the document it generates. Whole app,
single light theme.

## Palette

| Token | Value | Role |
|---|---|---|
| `canvas` | `#F7F8FA` | cool paper white page background (not cream) |
| `surface` | `#FFFFFF` | panels/cards — white sheets on cool paper |
| `surface-raised` | `#EFF1F5` | inset fills: code excerpts, hovers |
| `ink` | `#171A20` | primary text |
| `ink-muted` | `#4C5461` | secondary text |
| `ink-faint` | `#69707D` | labels/metadata (≥4.5:1 on canvas) |
| `rule` / `rule-strong` | `#E2E5EA` / `#C3C8D1` | hairlines |
| `accent` / `accent-hover` | `#2432C7` / `#1B27A6` | deep ultramarine — the single signature hue |
| `critical` / `danger` | `#B42318` | status hues, AA as text on canvas |
| `high` | `#B54708` | |
| `medium` / `warning` | `#8F6400` (shared) | warning was darkened from #9A6700 for AA on `surface-raised` |
| `low` | `#2F6B50` | |
| `success` | `#1E7F45` | |
| `live` | `#157F3D` | |

## Typography

- Display: Archivo Variable, `"wdth" 112`, weight 500–650, tight tracking at large sizes.
- Body: IBM Plex Sans Variable.
- Mono: IBM Plex Mono 400/500 for data, SHAs, field labels.

## Layout language ("record/form" motif)

- Record headers: page headers read like document headers — title plus a metadata
  field grid (small-caps mono label over value, hairline-separated cells).
- Stamped verdicts: status/severity as compact bordered stamp-like marks;
  severity keeps a calibrated tick bar.
- Signature element — evidence exhibits (incident detail): numbered exhibits with
  `path:line` specimen tags, framed excerpts on `surface-raised`, cross-reference
  markers from the root-cause statement. The one bold element; all else quiet.
- Small radii (2–4px), generous whitespace, boxed field grids — not dense
  newspaper hairlines. Small-caps mono labels only where they label real data.
- Restrained motion: keep `agent-log-entry` enter animation + reduced-motion block.
