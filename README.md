# Pimpelmees Wallgen PSD tool

macOS app that checks PSD specs and converts to print-ready TIFF files via Adobe Photoshop.

## Features

- Validates document specs (dimensions, DPI, color mode, ICC profile)
- Detects image data outside canvas bounds
- Detects semi-transparent pixels (problematic for print)
- Converts to flattened LZW-compressed TIFF with ICC profile
- Auto-update checking via GitHub releases

## Requirements

- macOS
- Adobe Photoshop (2026 or later)

## Install

Download the latest `.zip` from [Releases](https://github.com/doublej/pimpelmees-wallgen-psd-tool/releases/latest), extract, and double-click the `.app` to run.

The app checks for updates on launch and offers one-click updating from within the UI.

## Development

### Build

```bash
scripts/build.sh
```

Assembles `build/Pimpelmees Wallgen PSD tool.app` from the modular source files in `src/`.

### Release

```bash
# Bump version in version.txt, then:
scripts/release.sh
```

Builds, zips, tags, pushes, and creates a GitHub release. Requires `gh` CLI.

### Project structure

```
src/
  main.jsx              # Entry point
  modules/
    config.jsx          # Constants
    utils.jsx           # Pure utilities
    io.jsx              # File I/O, version reading, TIFF saving
    analysis.jsx        # Document inspection
    actions.jsx         # Document modifications, auto-update
    ui-helpers.jsx      # Reusable ScriptUI components
    ui-welcome.jsx      # Welcome dialog
    ui-picker.jsx       # Document picker dialog
    ui-preview.jsx      # Preview/convert dialog
  run.sh                # App launcher (update check + Photoshop invocation)
  Info.plist            # App bundle template
  resources/            # Icons, logos
scripts/
  build.sh              # Build script (concatenates modules into single .jsx)
  release.sh            # Release script (build + tag + GitHub release)
version.txt             # Single source of truth for version
```

ExtendScript has no module system, so `build.sh` concatenates all `.jsx` files into a single `build/psd-to-tiff.jsx` at build time.
