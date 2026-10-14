# RF-07 shared responsive styling

Issue: [frontend #304](https://github.com/B2MAGE/mage-frontend/issues/304).
Branch: `codex/rf07-shared-responsive-styling`, based on `dad0b0e`.
Local verification: October 14, 2026. Awaiting owner review; not merged or deployed.

## Shared ownership

- `MagePlayerControls` remains the common controls component. `magePlayer.css`
  now owns its layout and the common viewport/fullscreen geometry. The old
  overlay grid, mobile reordering, separate player skin stylesheet and redundant
  featured/detail/editor overrides are removed. Themes supply colors and button
  appearance, rather than different control layouts.
- `scene-editor-controls.css` owns editor field hover, focus, invalid and disabled
  states, plus disclosure row layout and interaction states. Section styles own
  placement; theme variables supply the palette. Classic selects use the shared
  Classic controls stylesheet.
- The editor and player use one controls-height token. Explicit title line height
  and the preview's border allowance prevent the former two-pixel clipping and
  narrow side gaps. Short editor layouts scroll instead of losing controls.
- Stopped, unavailable and invalid players retain the route's disabled playlist
  button when that route normally offers it. Single-song players do not gain one.

Original and Selective music response, scene data, rendering, recovery policy and
server behavior are unchanged. The existing shared page gutter remains 4px at
small widths. The watch player's deliberate edge-to-edge stage is preserved.

## Visual matrix

Checked in the local Chromium in-app browser with viewport overrides. Featured
and watch checks used the existing Signal Duet scene; editor checks used Prism
Core. These are desktop responsive checks, not physical-phone or Safari coverage.

| Surface | Theme | 320 × 740 | 768 × 900 | 1440 × 1000 |
| --- | --- | --- | --- | --- |
| Featured scene | MAGE Pulse | Pass | Pass | Pass |
| Scene detail | MAGE Pulse | Pass | Pass | Pass |
| Create preview | MAGE Pulse | Pass | Pass | Pass |
| Featured scene | Classic Blue | Pass | Pass | Pass |
| Scene detail | Classic Blue | Pass | Pass | Pass |
| Create preview | Classic Blue | Pass | Pass | Pass |

Pass means no document horizontal overflow, one controls row with play on the
left and utilities on the right, a usable seek track, and a 16:9 embedded scene.
Editor scenes meet the preview header without a gap. Controls remain present
during loading and when stopped. The control bar is 60px in both themes; the
narrow play button remains 34px wide rather than shrinking to fit a long title.

Additional checks:

- A generated 20-second WAV with a long filename: truncation, seek and volume popup
  remained within the 320px editor. No scene or template was saved.
- Stop/Resume on editor and watch; the watch playlist icon remains disabled in
  place. Fullscreen keeps its controls accessible along the bottom.
- Camera, animation and music disclosures remain 42px collapsed and expanded in
  both themes, with visible keyboard focus. Raw JSON remains 48px.
- Description focus uses the correct theme surface; invalid JSON retains an
  error border; Builder color fields retain their nested swatch/text layout.
- Original and Selective both remain available through the normal music selector.
- Compact editor scrolling, preview collapse/restore and field access checked
  with limited vertical space, in addition to the matrix above.

## Automated verification

- Production application build (TypeScript and Vite) and ESLint passed. Existing
  engine `eval` and bundle-size warnings remain.
- Focused player suites: 96 tests passed, including new ready → stopped →
  unavailable checks for routes with and without a playlist action and for
  single-song players.
- Editor/shared UI suites: 46 tests passed across field error mapping,
  `MusicResponseControls`, `SceneEditor.confirm` and `PagePrimitives`.
- CSS parsing/transforms and `git diff --check` passed.

No engine or backend change is required for this frontend refactor.
