#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(cat version.txt | tr -d '[:space:]')
APP_NAME="Pimpelmees Wallgen PSD tool"
ZIP_NAME="${APP_NAME}.zip"
TAG="v${VERSION}"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: uncommitted changes. Commit first."
    exit 1
fi

# Check tag doesn't exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Error: tag $TAG already exists. Bump version.txt first."
    exit 1
fi

# Sync sources into the app bundle
cp psd-to-tiff.jsx "${APP_NAME}.app/Contents/Resources/psd-to-tiff.jsx"
cp version.txt "${APP_NAME}.app/Contents/Resources/version.txt"

# Build zip
rm -f "$ZIP_NAME"
ditto -c -k --keepParent "${APP_NAME}.app" "$ZIP_NAME"
echo "Built $ZIP_NAME ($(du -h "$ZIP_NAME" | cut -f1))"

# Tag and push
git tag "$TAG"
git push origin main --tags

# Create GitHub release
gh release create "$TAG" "$ZIP_NAME" \
    --title "$TAG" \
    --notes "Release ${VERSION}" \
    --latest

echo "Released $TAG"
