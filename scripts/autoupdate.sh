#!/bin/bash
set -euo pipefail

# Autoupdate script for Pimpelmees Wallgen PSD tool
# Checks GitHub for a newer release and replaces the local .app bundle.
#
# Usage: ./scripts/autoupdate.sh [--check-only]

REPO="doublej/pimpelmees-wallgen-psd-tool"
APP_NAME="Pimpelmees Wallgen PSD tool"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$PROJECT_DIR/version.txt"
CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

echo "Current version: $CURRENT_VERSION"

# Fetch latest release tag from GitHub
LATEST=$(gh release view --repo "$REPO" --json tagName -q '.tagName' 2>/dev/null || true)

if [ -z "$LATEST" ]; then
    echo "Could not fetch latest release. Check network/gh auth."
    exit 1
fi

LATEST_VERSION="${LATEST#v}"
echo "Latest version:  $LATEST_VERSION"

if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
    echo "Already up to date."
    exit 0
fi

if [ "${1:-}" = "--check-only" ]; then
    echo "Update available: $CURRENT_VERSION -> $LATEST_VERSION"
    exit 0
fi

echo "Updating $CURRENT_VERSION -> $LATEST_VERSION..."

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Download release asset
gh release download "$LATEST" --repo "$REPO" --dir "$TMPDIR" --pattern "*.zip"

ZIP_FILE="$TMPDIR/${APP_NAME}.zip"
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: expected $ZIP_FILE not found in release assets."
    ls "$TMPDIR"
    exit 1
fi

# Replace app bundle
rm -rf "$PROJECT_DIR/${APP_NAME}.app"
ditto -x -k "$ZIP_FILE" "$PROJECT_DIR"
echo "$LATEST_VERSION" > "$VERSION_FILE"

echo "Updated to $LATEST_VERSION"
