_app := "Pimpelmees Wallgen PSD tool"

# List available recipes
default:
    @just --list
    @echo ''
    @echo "branch: $(git branch --show-current 2>/dev/null || echo 'n/a')"

# Build the .app bundle + concatenated psd-to-tiff.jsx
[group('build')]
build:
    scripts/build.sh

# Build, then open the .app (which auto-runs the script in Photoshop)
[group('develop')]
run: build
    open "build/{{_app}}.app"

# Build, then run the bare .jsx directly in Photoshop (skips launcher)
[group('develop')]
run-jsx: build
    osascript -e 'tell application id "com.adobe.photoshop" to activate' \
              -e 'tell application id "com.adobe.photoshop" to do javascript file (POSIX file "{{justfile_directory()}}/build/psd-to-tiff.jsx")'

# Print current version
[group('develop')]
version:
    @cat version.txt

# Bump patch in version.txt (manual edit for minor/major)
[group('develop')]
bump-patch:
    #!/usr/bin/env bash
    cur=$(tr -d '[:space:]' < version.txt)
    IFS=. read -r maj min pat <<< "$cur"
    new="$maj.$min.$((pat + 1))"
    echo "$new" > version.txt
    echo "$cur -> $new"

# Build, zip, tag, push, GitHub release (requires clean tree + gh CLI)
[group('deploy')]
release:
    scripts/release.sh

# Remove build artifacts
[group('cleanup')]
clean:
    rm -rf build/
