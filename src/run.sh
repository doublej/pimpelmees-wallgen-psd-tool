#!/bin/bash
RESOURCES="$(dirname "$0")/../Resources"
UPDATE_FILE="/tmp/pimpelmees-psd-tool-update.txt"
REPO="doublej/pimpelmees-wallgen-psd-tool"
VERSION=$(cat "$RESOURCES/version.txt" 2>/dev/null || echo "0.0.0")

# Check for updates via GitHub redirect (no API rate limits)
rm -f "$UPDATE_FILE"
LATEST=$(curl -sf --max-time 3 -o /dev/null -w '%{redirect_url}' \
    "https://github.com/$REPO/releases/latest" \
    | sed 's|.*/v||')

if [ -n "$LATEST" ] && [ "$(printf '%s\n' "$VERSION" "$LATEST" | sort -V | tail -1)" = "$LATEST" ] && [ "$LATEST" != "$VERSION" ]; then
    echo "$LATEST" > "$UPDATE_FILE"
fi

osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "'"$RESOURCES/psd-to-tiff.jsx"'"'
