# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A macOS `.app` that runs inside Adobe Photoshop via ExtendScript (.jsx). It validates PSD specs (dimensions, DPI, color mode, ICC profile) and converts documents to print-ready flattened LZW-compressed TIFF files. It can also create new documents from predefined wallpaper product templates. All UI text is in Dutch.

## Build & release

```bash
scripts/build.sh      # → build/Pimpelmees Wallgen PSD tool.app + build/psd-to-tiff.jsx
scripts/release.sh    # builds, zips, tags, pushes, creates GitHub release (requires gh CLI)
```

Version lives in `version.txt` (single source of truth). Bump it before releasing.

## Architecture

ExtendScript has no module system. `build.sh` concatenates `src/modules/*.jsx` + `src/main.jsx` into a single `psd-to-tiff.jsx` in **dependency order** — the order in the `MODULES` array in `build.sh` matters. All functions share a single global scope at runtime.

The `.app` bundle structure:
- `Contents/MacOS/run.sh` — shell launcher: checks for updates via GitHub redirect, auto-detects Photoshop version in `/Applications`, installs bundled ICC profiles to `~/Library/ColorSync/Profiles/`, then invokes the ExtendScript via `osascript`
- `Contents/Resources/psd-to-tiff.jsx` — the concatenated script
- `Contents/Resources/version.txt`, `*.icc`, `*.png`, `*.icns` — bundled resources

## Key constraints

- **ExtendScript (ES3)**: no `let`/`const`, no arrow functions, no template literals, no `Array.prototype.map/filter/forEach`. Use `var`, `for` loops, string concatenation.
- **No imports/exports**: every function is global. Avoid name collisions across modules.
- **Module order matters**: a module can only call functions defined in modules listed before it in `build.sh`'s `MODULES` array (except `main.jsx` which runs last).
- **ICC profiles**: Grayscale requires `Gray Gamma 1.0`, CMYK requires `FOGRA39`. Only these two color modes are supported for TIFF output.
- **DPI**: expected resolution is 100 DPI (for large-format wallpaper printing).
- **Product shapes**: rectangle (wallpaper), behangcirkel, muursticker, behangboog (arch), drieluik (triptych) — each with specific bleed values defined in `config.jsx`.

## Testing

No automated tests. To test: run `scripts/build.sh`, then open the `.app` or run the built `.jsx` directly in Photoshop via File → Scripts → Browse.
