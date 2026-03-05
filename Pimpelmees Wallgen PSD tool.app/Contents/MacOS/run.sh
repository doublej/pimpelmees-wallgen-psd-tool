#!/bin/bash
RESOURCES="$(dirname "$0")/../Resources"
UPDATE_FILE="/tmp/pimpelmees-psd-tool-update.txt"
VERSION=$(cat "$RESOURCES/version.txt" 2>/dev/null || echo "0.0.0")

# Background update check (non-blocking)
(
    LATEST=$(curl -sf --max-time 3 \
        "https://api.github.com/repos/doublej/pimpelmees-wallgen-psd-tool/releases/latest" \
        | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
    if [ -n "$LATEST" ] && [ "$LATEST" != "$VERSION" ]; then
        echo "$LATEST" > "$UPDATE_FILE"
    else
        rm -f "$UPDATE_FILE"
    fi
) &

osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "'"$RESOURCES/psd-to-tiff.jsx"'"'
