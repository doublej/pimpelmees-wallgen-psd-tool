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

# Assemble .app bundle from src/
APP="build/${APP_NAME}.app"
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp src/Info.plist       "$APP/Contents/Info.plist"
cp src/run.sh           "$APP/Contents/MacOS/run.sh"
chmod +x                "$APP/Contents/MacOS/run.sh"
cp src/psd-to-tiff.jsx  "$APP/Contents/Resources/psd-to-tiff.jsx"
cp version.txt          "$APP/Contents/Resources/version.txt"
cp src/resources/*      "$APP/Contents/Resources/"

echo "Built $APP"

# Build zip
rm -f "build/$ZIP_NAME"
ditto -c -k --keepParent "$APP" "build/$ZIP_NAME"
echo "Built build/$ZIP_NAME ($(du -h "build/$ZIP_NAME" | cut -f1))"

# Tag and push (bypass global beads hooks)
git tag "$TAG"
git -c core.hooksPath=.git/hooks push origin main --tags

# Create GitHub release
gh release create "$TAG" "build/$ZIP_NAME" \
    --title "$TAG" \
    --notes "Release ${VERSION}" \
    --latest

echo "Released $TAG"
