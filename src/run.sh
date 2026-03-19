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

# Self-install to /Applications (replace older version)
APP_BUNDLE="$(cd "$(dirname "$0")/../.." && pwd)"
APP_BASENAME="$(basename "$APP_BUNDLE")"
TARGET="/Applications/$APP_BASENAME"
if [ "$APP_BUNDLE" != "$TARGET" ] && [[ "$APP_BASENAME" == *.app ]]; then
    rm -rf "$TARGET"
    cp -R "$APP_BUNDLE" "$TARGET"
fi

# Discover newest Adobe Photoshop in /Applications
PS_APP=""

# Modern year-named versions (newest first)
for year in 2030 2029 2028 2027 2026 2025 2024 2023 2022 2021 2020; do
    if [ -d "/Applications/Adobe Photoshop ${year}" ]; then
        PS_APP="Adobe Photoshop ${year}"
        break
    fi
done

# CC-era versions
if [ -z "$PS_APP" ]; then
    for year in 2019 2018 2017 2016 2015 2014; do
        if [ -d "/Applications/Adobe Photoshop CC ${year}" ]; then
            PS_APP="Adobe Photoshop CC ${year}"
            break
        fi
    done
fi

# Unversioned fallback
if [ -z "$PS_APP" ] && [ -d "/Applications/Adobe Photoshop" ]; then
    PS_APP="Adobe Photoshop"
fi

if [ -z "$PS_APP" ]; then
    osascript -e 'display dialog "Adobe Photoshop is niet gevonden in /Applications.\n\nInstalleer Adobe Photoshop en probeer het opnieuw." buttons {"OK"} default button "OK" with icon stop with title "Pimpelmees Wallgen PSD tool"'
    exit 1
fi

# Install bundled ICC profiles if missing
ICC_DIR="$HOME/Library/ColorSync/Profiles"
mkdir -p "$ICC_DIR"
for icc in "$RESOURCES"/*.icc; do
    [ -f "$icc" ] || continue
    dest="$ICC_DIR/$(basename "$icc")"
    [ -f "$dest" ] || cp "$icc" "$dest"
done

# Install ExtendScript into Photoshop Scripts menu
SCRIPTS_DIR="/Applications/$PS_APP/Presets/Scripts"
if [ -d "$SCRIPTS_DIR" ]; then
    cp "$RESOURCES/psd-to-tiff.jsx" "$SCRIPTS_DIR/Pimpelmees Wallgen PSD tool.jsx"
    RESDIR="$SCRIPTS_DIR/pimpelmees-resources"
    mkdir -p "$RESDIR"
    cp "$RESOURCES/version.txt" "$RESDIR/"
    cp "$RESOURCES/logo_dialog.png" "$RESDIR/"
fi

osascript -e 'tell application "'"$PS_APP"'" to do javascript file "'"$RESOURCES/psd-to-tiff.jsx"'"'
