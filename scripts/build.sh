#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(cat version.txt | tr -d '[:space:]')
BUILD=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
APP_NAME="Pimpelmees Wallgen PSD tool"
APP="build/${APP_NAME}.app"

echo "Building v${VERSION} (${BUILD})"

rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Info.plist with version stamps
sed -e "s/__VERSION__/${VERSION}/" \
    -e "s/__BUILD__/${VERSION}.${BUILD}/" \
    src/Info.plist > "$APP/Contents/Info.plist"

# Launcher
cp src/run.sh "$APP/Contents/MacOS/run.sh"
chmod +x      "$APP/Contents/MacOS/run.sh"

# ExtendScript
cp src/psd-to-tiff.jsx "$APP/Contents/Resources/psd-to-tiff.jsx"

# Version file (read by run.sh and ExtendScript at runtime)
echo "$VERSION" > "$APP/Contents/Resources/version.txt"

# Resources (icons, logos)
cp src/resources/* "$APP/Contents/Resources/"

echo "Built $APP (v${VERSION}, build ${BUILD})"
