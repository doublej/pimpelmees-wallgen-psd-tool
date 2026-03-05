#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(cat version.txt | tr -d '[:space:]')
BUILD=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
APP_NAME="Pimpelmees Wallgen PSD tool"
APP="build/${APP_NAME}.app"
JSX="build/psd-to-tiff.jsx"

echo "Building v${VERSION} (${BUILD})"

rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Concat modules into single ExtendScript (dependency order matters)
MODULES=(
    src/modules/config.jsx
    src/modules/utils.jsx
    src/modules/io.jsx
    src/modules/analysis.jsx
    src/modules/ui-helpers.jsx
    src/modules/actions.jsx
    src/modules/ui-welcome.jsx
    src/modules/ui-picker.jsx
    src/modules/ui-preview.jsx
    src/main.jsx
)

{
    echo "// psd-to-tiff.jsx — ${APP_NAME} v${VERSION} (${BUILD})"
    echo "// Built: $(date -u '+%Y-%m-%d %H:%M UTC')"
    echo "// DO NOT EDIT — generated from src/modules/*.jsx + src/main.jsx"
    echo "#target photoshop"
    echo ""
    for mod in "${MODULES[@]}"; do
        echo "// --- $(basename "$mod") ---"
        # Strip #target and file-level comments, keep the rest
        sed '/^#target/d; /^\/\/ [a-z-]*\.jsx/d' "$mod"
        echo ""
    done
} > "$JSX"

echo "Assembled $JSX ($(wc -l < "$JSX" | tr -d ' ') lines)"

# Info.plist with version stamps
sed -e "s/__VERSION__/${VERSION}/" \
    -e "s/__BUILD__/${VERSION}.${BUILD}/" \
    src/Info.plist > "$APP/Contents/Info.plist"

# Launcher
cp src/run.sh "$APP/Contents/MacOS/run.sh"
chmod +x      "$APP/Contents/MacOS/run.sh"

# ExtendScript
cp "$JSX" "$APP/Contents/Resources/psd-to-tiff.jsx"

# Version file (read by run.sh and ExtendScript at runtime)
echo "$VERSION" > "$APP/Contents/Resources/version.txt"

# Resources (icons, logos)
cp src/resources/* "$APP/Contents/Resources/"

echo "Built $APP (v${VERSION}, build ${BUILD})"
