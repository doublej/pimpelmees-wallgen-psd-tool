#!/bin/bash
RESOURCES="$(dirname "$0")/../Resources"
UPDATE_FILE="/tmp/pimpelmees-psd-tool-update.txt"
VERSION=$(cat "$RESOURCES/version.txt" 2>/dev/null || echo "0.0.0")

# Show a small notification while checking
osascript -e 'display notification "Controleren op updates..." with title "Pimpelmees Wallgen PSD tool" subtitle "v'"$VERSION"'"' &

# Synchronous update check (uses gh cli for private repo auth)
rm -f "$UPDATE_FILE"
LATEST=$(gh release view --repo doublej/pimpelmees-wallgen-psd-tool --json tagName -q '.tagName' 2>/dev/null | sed 's/^v//')

if [ -n "$LATEST" ] && [ "$LATEST" != "$VERSION" ]; then
    echo "$LATEST" > "$UPDATE_FILE"
    osascript -e 'display notification "v'"$LATEST"' beschikbaar — voer autoupdate.sh uit" with title "Pimpelmees Wallgen PSD tool" subtitle "Update beschikbaar"'
fi

osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "'"$RESOURCES/psd-to-tiff.jsx"'"'
