# Narrow viewport acceptance (tablet / small laptop)

Official product support is **desktop browsers**; see
`docs/architecture/桌面端浏览器支持策略.md`. Field use on **tablets** or small
laptops is **best-effort**. Use this checklist when changing layout-critical
surfaces (especially **转写**).

## Breakpoints to verify

| Width | Intent |
| --- | --- |
| **1024px** | iPad landscape–class; side panes and waveform should remain usable. |
| **768px** | iPad portrait–class; expect stacked or scroll-heavy UI; no dead clicks. |

## Manual pass (per milestone if layout touched)

1. Open `/transcription` with a loaded project (or seed fixture).
2. DevTools responsive mode: **1024 × 768**, then **768 × 1024**.
3. Confirm: primary nav visible; project hub opens; timeline scrolls; no
   controls permanently under the fold without scroll.
4. Optional: repeat on a physical iPad if available.

## Engineering follow-ups

- Prefer fixing **overflow** and **min-width** clashes over shrinking typography.
- If a region is intentionally unsupported below a width, show a short inline
  hint rather than a broken layout.
