#!/bin/bash
RESOURCES="$(dirname "$0")/../Resources"
UPDATE_FILE="/tmp/pimpelmees-psd-tool-update.txt"
VERSION=$(cat "$RESOURCES/version.txt" 2>/dev/null || echo "0.0.0")

# Show a small notification while checking
osascript -e 'display notification "Controleren op updates..." with title "Pimpelmees Wallgen PSD tool" subtitle "v'"$VERSION"'"' &

# Synchronous update check (3s max)
rm -f "$UPDATE_FILE"
LATEST=$(curl -sf --max-time 3 \
    "https://api.github.com/repos/doublej/pimpelmees-wallgen-psd-tool/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')

if [ -n "$LATEST" ] && [ "$LATEST" != "$VERSION" ]; then
    echo "$LATEST" > "$UPDATE_FILE"
    osascript -e 'display notification "v'"$LATEST"' beschikbaar — voer autoupdate.sh uit" with title "Pimpelmees Wallgen PSD tool" subtitle "Update beschikbaar"'
fi

osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "'"$RESOURCES/psd-to-tiff.jsx"'"'
