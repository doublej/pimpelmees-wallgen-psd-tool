#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="Pimpelmees Wallgen PSD tool"
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
