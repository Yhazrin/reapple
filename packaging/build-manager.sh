#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: packaging/build-manager.sh OUTPUT_DIRECTORY}"
mkdir -p "$OUT"
APP="$OUT/Reapple Music.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/runtime"
# CLT 27 omits the SwiftUI State macro plugin; use the stable SDK when available.
SDK="${SDKROOT:-$(xcrun --show-sdk-path)}"
STABLE="$(xcode-select -p)/SDKs/MacOSX26.5.sdk"
[ ! -d "$STABLE" ] || SDK="$STABLE"
swiftc -sdk "$SDK" -parse-as-library -swift-version 6 -O -target "$(uname -m)-apple-macos14.0" \
  "$ROOT"/manager/*.swift -o "$APP/Contents/MacOS/ReappleManager"
[ -x "$ROOT/vendor/node/node" ] || { echo "Missing bundled Node runtime" >&2; exit 1; }
"$ROOT/vendor/node/node" -e 'if(process.arch !== process.argv[1] || Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' "$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x64 )"
for item in bin agent config payload vendor install.sh; do
  rm -rf "$APP/Contents/Resources/runtime/$item"
  cp -R "$ROOT/$item" "$APP/Contents/Resources/runtime/"
done
cp "$ROOT/manager/Resources/ReappleIcon.png" "$APP/Contents/Resources/"
cp "$ROOT/manager/Resources/Reapple.icns" "$APP/Contents/Resources/"
rm -rf "$APP/Contents/Resources/Reapple.icon"
cp -R "$ROOT/manager/Resources/Reapple.icon" "$APP/Contents/Resources/"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.reapple.manager</string>
<key>CFBundleName</key><string>Reapple Music</string>
<key>CFBundleDisplayName</key><string>Reapple Music</string>
<key>CFBundleExecutable</key><string>ReappleManager</string>
<key>CFBundleIconFile</key><string>Reapple</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.3.0</string>
<key>CFBundleVersion</key><string>3</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"
printf '%s\n' "$APP"
