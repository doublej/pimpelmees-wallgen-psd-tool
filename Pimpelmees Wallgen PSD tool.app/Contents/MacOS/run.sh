#!/bin/bash
osascript -e 'tell application "Adobe Photoshop 2026" to do javascript file "'"$(dirname "$0")/../Resources/psd-to-tiff.jsx"'"'
