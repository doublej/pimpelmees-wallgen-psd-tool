# Brief: circle + arc automation in `wallgen-psd-preflight`

**Reader:** maintainer of `tools/wallgen-psd-preflight/` (ExtendScript `.jsx` → Adobe Photoshop, packaged as macOS `.app`).
**Author:** wallgen team.
**Status:** scoped implementation task — no code changes attached. Circle automation is confirmed scope. Expanded arc automation is **not** confirmed scope.
**Goal:** make `wallgen-psd-preflight` the single one-click place where Inge prepares circle-source and, eventually, arc-source PSDs so they are guaranteed wallgen-ready.

---

## 1. Inspect before you change

Do not start by guessing. Read these first and ground every implementation decision in the actual current code:

- `tools/wallgen-psd-preflight/src/modules/config.jsx`
- `tools/wallgen-psd-preflight/src/modules/analysis.jsx`
- `tools/wallgen-psd-preflight/src/modules/actions.jsx`
- `tools/wallgen-psd-preflight/src/modules/ui-preview.jsx`
- `tools/wallgen-psd-preflight/src/modules/ui-helpers.jsx`
- `tools/wallgen-psd-preflight/scripts/build.sh`
- `wallgen/var/catalog/dimensions.json`

Do not speculate about functions, constants, or module order before you have read them.

---

## 2. Why

Inge currently delivers PSD source files for mono circles via Dropbox at `/_LICENTIES_PRODUCTEN/_BEHANG/COLLECTIE/COLLECTIE_CIRKELS/__CIRKELS_VOOR_TOOL/MONO/` — 15 files, ~6 GB. We analysed the full set against wallgen's catalog expectations.

**None of the current files match wallgen's specs.** Per-file evidence (composite preview + measured circle Ø) lives on the wallgen dev machine at `/tmp/mono-cirkels/report.html`.

### Observed issues

| Issue | Example | Frequency |
|---|---|---|
| Canvas size not from catalog | AW color = 320 cm, BD = 152 cm, WW = 134 cm | 15/15 |
| Color and zwart variants of same design at different scales | AW color 320 cm vs AW zwart 254 cm | 6/6 pairs |
| Circle Ø ≥ canvas → clipped content, no bleed | WW color: 153 cm circle inside 134 cm canvas | ~5/15 |
| Color mode = Duotone (Photoshop `DocumentMode` value 8) | all files | 15/15 |
| No embedded ICC profile | all files | 15/15 — acceptable, wallgen recolors |
| Ungrouped layers, generic names (`Layer 30 copy 2`) | all files | 15/15 |
| Multiple "final" variants in one folder | BOER: `_bron`, `_02`, `_DEF`, `_plat` | 1 design |

### What the tool already does

`src/modules/analysis.jsx` already covers: DPI mismatch, color mode + ICC check (`checkIccProfile`), out-of-canvas content (`measureOutOfCanvas`), semi-transparent pixels (`hasSemiTransparentPixels`). `src/modules/actions.jsx` already has `addWhiteBackground` and `createNewDocument`. Current output is a single flattened LZW-compressed TIFF at a time.

**Extend the existing tool — do not replace it.**

---

## 3. Required implementation

The numbering matches the order Inge's workflow needs them in.

### 3.1 Duotone → Grayscale conversion

When `doc.mode === DocumentMode.DUOTONE`, present this Dutch user-facing message:

> "Dit bestand staat op Duotone. Ik converteer hem naar grijswaarden voor je."

Implement on a duplicate document only:

- `Image → Mode → Grayscale`.
- Assign `Gray Gamma 1.0` afterward through the same path the tool already uses for `EXPECTED_GRAY_ICC`.

Rationale: wallgen reads the source as flattened grayscale and recolors it per variant downstream. Embedded ICC does not matter for wallgen input, but the tool's documented contract is Grayscale mode + `Gray Gamma 1.0`, so preserve that contract.

### 3.2 Circle detection + auto-resize to catalog size

Add a new analyser in `src/modules/analysis.jsx`:

```
detectCircle(doc)
```

Returns:

```
{
  cx_px: number,
  cy_px: number,
  r_px: number,
  diameter_mm: number,
  source: "mask" | "auto"
}
```

Returns `null` if no circle can be detected.

Detection strategy:

- **Preferred:** a named clipping mask — e.g. a layer named `cirkel` or a vector mask on a designated layer.
- **Fallback:** largest non-white connected region in a flattened preview, centroid + P99.5 radius.

Do not hardcode the final detection contract before validating it with Inge (see §8). Implement the fallback only if it fits the current Photoshop/ExtendScript constraints.

Add a pure helper:

```
nearestCatalogDiameter(diameterMm, shape)
```

Returns:

```
{
  catalog_mm: number,
  alternatives_mm: array,
  ambiguous: boolean
}
```

Compare against catalog source `wallgen/var/catalog/dimensions.json`. Current known diameters:

- **BC / Behangcirkel:** 95 cm, 142.5 cm, 190 cm, 237.5 cm
- **MS / Muursticker:** 30 cm, 100 cm, 120 cm, 140 cm

Use millimetres internally:

- 95 cm = 950 mm
- 142.5 cm = 1425 mm
- 190 cm = 1900 mm
- 237.5 cm = 2375 mm

If detected diameter falls between two catalog sizes, ask Inge with this kind of Dutch UI text:

> "Gemeten: 152 cm cirkel. Bedoel je 142,5 cm of 190 cm?"

After confirmation, resize canvas **and** content together so the detected circle Ø equals the chosen catalog size.

`app.activeDocument.resizeImage()` is destructive. Always operate on `activeDocument.duplicate()` first.

### 3.3 Bleed fix

If circle Ø ≥ canvas, or any side of the circle bounding box reaches a canvas edge, offer:

> "Voeg afloop toe (10 mm rondom)"

Implementation intent:

- `Image → Canvas Size`, anchor centred.
- Preserve background color.
- For mono sources: fill bleed with white.

Bleed values (already defined in `config.jsx`):

- BC: `BLEED_BC` = 10 mm
- MS: `BLEED_MS` = 3 mm
- ARC: `BLEED_ARC` = 3 mm
- RECT: `BLEED_RECT` = 3 mm
- DL: `BLEED_DL` = 3 mm

Order matters: apply bleed **after** resizing content to the catalog diameter. Final canvas for circles is:

```
catalog diameter + 2 × bleed
```

### 3.4 Batch export per shape

Inge wants to clean one master design once, then click one button to export the full catalog set as separate TIFFs.

For **BC**, export four TIFFs:

| Catalog Ø | Final canvas (with 10 mm bleed) | Filename |
|---|---|---|
| 95 cm | 97 × 97 cm | `{ABBR}_BC_0950.tif` |
| 142.5 cm | 144.5 × 144.5 cm | `{ABBR}_BC_1425.tif` |
| 190 cm | 192 × 192 cm | `{ABBR}_BC_1900.tif` |
| 237.5 cm | 239.5 × 239.5 cm | `{ABBR}_BC_2375.tif` |

For **MS**, follow the same pattern with the four MS diameters and `_MS_` in the filename.

Per-file export requirements:

- Mode: Grayscale
- Compression: LZW
- ICC: `Gray Gamma 1.0`
- DPI: 100 (existing `EXPECTED_DPI`)
- Filename pattern: `{ABBR}_BC_{diameter_mm}.tif` or `{ABBR}_MS_{diameter_mm}.tif`
- `{diameter_mm}` is a 4-digit millimetre string with no decimal:
  - 95 cm → `0950`
  - 142.5 cm → `1425`
  - 190 cm → `1900`
  - 237.5 cm → `2375`
- `{ABBR}` is the existing per-design abbreviation used elsewhere in Pimpelmees (`AW`, `BD`, `BOER`, `GS`, `JW`, `WW`, …).
- Output directory: `{master_dir}/{master_name}_export/`.

**Never write next to the master PSD. Never modify the master PSD.**

### 3.5 Arc support — do not extend yet

Current arc support is hardcoded to a single 90 × 175 cm format (`ARC_W_MM = 900`, `ARC_H_MM = 1750`).

**Do not extend arc export yet.** Validate with Inge first (see §8 question 3) whether she needs multiple arc sizes. Circle automation is confirmed; arc batch export is speculative.

If later confirmed, follow the same pattern:

- Multiple TIFFs per master.
- Filename pattern: `{ABBR}_ARC_{width_mm}x{height_mm}.tif`.
- Bleed: `BLEED_ARC` (3 mm).

### 3.6 Catalog as source of truth

`config.jsx` currently hardcodes `BC_DIAMETERS_MM`, `MS_DIAMETERS_MM`, and related shape dimensions. This must not remain the long-term source of truth. The authoritative catalog is `wallgen/var/catalog/dimensions.json`.

Choose one of these approaches based on what fits the existing release pipeline:

**Option A: build-time import** (preferred if it fits)

- `scripts/build.sh` reads `wallgen/var/catalog/dimensions.json` (path may be configurable).
- The build generates `src/modules/config-generated.jsx`.
- `config-generated.jsx` is concatenated **before** `config.jsx` in the `MODULES` array.
- `config.jsx` keeps only constants not derivable from the catalog:
  - `EXPECTED_DPI`
  - bleed values
  - ICC names

**Option B: bundled snapshot**

- Ship `Contents/Resources/dimensions.json`.
- Read it at script start with `File.read()`.
- Use this only if build-time generation does not fit the current app packaging flow.

Either way: `config.jsx` derives `BC_DIAMETERS_MM`, `MS_DIAMETERS_MM`, and arc dimensions from the catalog. Avoid silent drift when wallgen adds or changes catalog sizes.

---

## 4. Inge-facing UX requirements

Optimise for this workflow:

> Open the master → click "Verwerk cirkel" → choose AW / BD / BOER / … → tool does the rest.

No manual mode conversion. No manual canvas resizing. No separate export per size. The tool runs §3.1 → §3.2 → §3.3 → §3.4 in order on her behalf.

### Plain Dutch messages

Avoid technical-only diagnostics:

> "ICC profile mismatch"

Prefer plain Dutch:

> "Dit bestand staat op Duotone. Ik zet hem voor je om naar grijswaarden."

The existing tool already does this well in `ui-preview.jsx` with `addWarning` panels and explanatory paragraphs. Follow that pattern.

### Preview before export

Before TIFFs are written, show a preview confirming:

- which circle was detected (overlay on the composite),
- which catalog size was chosen,
- where the bleed will land.

Visual confirmation prevents the "wrong cirkel" surprise that nobody catches until wallgen renders it.

### Preserve the master

Always work on a duplicate:

```
var working = activeDocument.duplicate();
// all subsequent mutations happen on `working`
```

Close the duplicate without saving when export completes. The master file on disk stays untouched. TIFFs land in `{master_dir}/{master_name}_export/`.

### Filename convention

`{ABBR}_BC_{diameter_mm}.tif`, mm-based, zero-padded to 4 digits. Each exported TIFF's size is obvious at a glance in Finder, in Dropbox, in wallgen's import dialogs.

---

## 5. Implementation anchors in the existing codebase

Match the existing modular layout. Module concat order is enforced by the `MODULES` array in `scripts/build.sh` — keep new code in the matching tier.

### `src/modules/config.jsx`

Extend; do not replace. Existing constants include `BC_DIAMETERS_MM`, `MS_DIAMETERS_MM`, `BLEED_BC`, `BLEED_MS`, `EXPECTED_GRAY_ICC`, `EXPECTED_DPI`.

If catalog source-of-truth work (§3.6) is implemented, shrink this file only where appropriate.

### `src/modules/analysis.jsx`

Add:

- `detectCircle(doc)` — see §3.2 for return shape.
- `nearestCatalogDiameter(diameterMm, shape)` — pure helper, see §3.2 for return shape.

Keep these functions compatible with existing analysis patterns such as `measureOutOfCanvas`.

### `src/modules/actions.jsx`

Add:

- `convertDuotoneToGrayscale(doc)` — mode change + ICC assign. Idempotent (no-op if already Grayscale).
- `resizeCanvasWithBleed(doc, targetDiameterMm, bleedMm)` — resizes content so the detected circle Ø equals `targetDiameterMm`, then `Image → Canvas Size` to `targetDiameterMm + 2 × bleedMm` square.
- `exportTiffSet(doc, diameterMmList, opts)` — runs the resize-and-export loop. Re-duplicates per export so each TIFF starts from the same source state. `opts` includes filename pattern, output dir, bleed, ICC, abbreviation, shape.

### `src/modules/ui-preview.jsx`

Add the batch-export UI. Reuse the existing `addWarning` / `addCompactRow` helpers from `ui-helpers.jsx` for consistency. New checkboxes may follow the existing `trimCb` / `whiteCb` / `downscaleCb` pattern.

### `scripts/build.sh`

If using build-time catalog import (§3.6 Option A), add a step **before** the `MODULES` concat loop that reads `dimensions.json` and writes `src/modules/config-generated.jsx`. Add `config-generated.jsx` to `MODULES` before `config.jsx`.

---

## 6. Hard constraints

- **ExtendScript = ES3.** Do not use `let`, `const`, arrow functions, template literals, `Array.prototype.map` / `.filter` / `.forEach`. Use `var`, classic `for` loops, string concatenation.
- **Module concat order matters.** A module can only call functions already defined earlier in the `MODULES` array.
- **`resizeImage()` is destructive.** Always operate on `activeDocument.duplicate()`.
- **Catalog diameters include half-centimetre values** (142.5, 237.5). Do all arithmetic in **millimetres**, not integer cm.
- **No global namespace collisions.** Every function lives in the same global scope at runtime.
- **Keep changes minimal and aligned with existing style.** Do not introduce unrelated refactors.
- **Do not add speculative features.**
- **Do not rewrite the tool architecture** unless the existing code makes the requested behaviour impossible. If it does, document the conflict in `docs/cirkel-handoff.md` (see §9) and stop for review before rewriting.

---

## 7. Validation requirement

Validate the implementation with **at least one representative PSD** from `/tmp/mono-cirkels/` when available. Suggested candidates (cover different failure modes):

- `WW_color.psb` — circle Ø > canvas (bleed case).
- `AW_color.psd` vs `zwart/AW_zwart.psd` — color/zwart scale mismatch.
- `BOER_color.psd` — one of the BOER variants; confirm with Inge which.

Record any Photoshop/ExtendScript limitations discovered during validation in `docs/cirkel-handoff.md`.

---

## 8. Validate with Inge before implementation

Record answers in `docs/cirkel-handoff.md` (see §9) before relying on them in code.

1. **Which BOER version is canonical?** Options:
   - `BOER_cirkel_bron.psd`
   - `BOER_cirkel_bron02.psb`
   - `BOER_cirkel_bron_DEF.psb`
   - `BOER_cirkel_bron_plat.psd`
2. **One master per design, or one per size?** Options:
   - One source PSD generates all four catalog sizes via the tool.
   - Each size is prepared separately and only needs validation.
3. **Is arc batch export needed?** If yes, what are the required arc sizes? If no, arcs stay manual for now.
4. **What is the circle detection contract?** Options:
   - Named clipping mask.
   - Layer literally called `cirkel`.
   - Vector mask on a designated layer.
   - Automatic largest-non-white-region detection.
   - Or both, with a fallback chain.

Don't guess these. Each one changes the UI and the data contract.

---

## 9. Documentation requirement

Create (or update) a companion file alongside this brief:

```
tools/wallgen-psd-preflight/docs/cirkel-handoff.md
```

Include:

- The **confirmed workflow** as it actually ends up (after Inge's answers land).
- The **open questions and answers from Inge** (mirror §8 with resolution status per item).
- The **catalog source-of-truth decision** taken (§3.6 Option A or B) and why.
- Any **Photoshop / ExtendScript limitations** found during implementation that change the contract from what is written in this brief.

This is the working log for the implementation; this brief is the static scope document.

---

## 10. Source pointers

- **Sample PSDs:** `/tmp/mono-cirkels/` on the wallgen dev machine, ~6 GB.
- **Dropbox source of truth:** `/_LICENTIES_PRODUCTEN/_BEHANG/COLLECTIE/COLLECTIE_CIRKELS/__CIRKELS_VOOR_TOOL/MONO/`.
- **Analysis report:** `/tmp/mono-cirkels/report.html` — per-file thumbnails, detected circles, canvas vs circle deltas.
- **Catalog source:** `wallgen/var/catalog/dimensions.json` — authoritative diameter list.
- **Existing tool repo:** `tools/wallgen-psd-preflight/` (this directory).

---

## 11. Completion criteria

The task is complete only when **all** of the following hold:

- [ ] Referenced files (§1) have been inspected before changes are made.
- [ ] Implementation stays within the confirmed circle-automation scope.
- [ ] Duotone detection presents the Dutch conversion message from §3.1.
- [ ] Duotone conversion produces Grayscale + `Gray Gamma 1.0` on a duplicate document, never on the master.
- [ ] Circle detection works through the agreed detection contract from §8 question 4, or its limitation is documented in `docs/cirkel-handoff.md`.
- [ ] The user can choose the intended catalog size when detection is ambiguous.
- [ ] Bleed is applied **after** resize.
- [ ] BC batch export creates all four TIFFs with correct canvas sizes, compression, DPI, ICC, and filenames.
- [ ] MS batch export follows the same pattern if implemented in scope.
- [ ] The original master PSD is never modified.
- [ ] TIFFs are written to `{master_dir}/{master_name}_export/`.
- [ ] The UI shows a preview of detected circle, chosen catalog size, and bleed before export.
- [ ] User-facing messages are plain Dutch.
- [ ] `dimensions.json` is used as the catalog source of truth, via §3.6 Option A or B.
- [ ] Arc export is **not** expanded unless §8 question 3 is explicitly confirmed by Inge.
- [ ] The result is validated with at least one representative PSD from `/tmp/mono-cirkels/` when available.
- [ ] Unresolved Inge questions are listed explicitly in `docs/cirkel-handoff.md` and not guessed.
- [ ] Final response (commit message / PR description) summarises what changed, where it changed, and how it was validated.
