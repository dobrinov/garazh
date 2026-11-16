#!/bin/sh
# Make every app icon from the three sources in src-tauri/icons:
#   source-windows.svg  full-bleed tile: Windows, Linux, the website (48 px and up)
#   source-mac.svg      inset tile with a shadow, as macOS draws app icons
#   source-small.svg    simpler drawing for 16–32 px (taskbar, title bar, favicon)
# Needs Google Chrome (to draw the SVGs) and ImageMagick; iconutil on macOS.
#
#   sh scripts/icons.sh
set -eu
cd "$(dirname "$0")/../src-tauri/icons"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for f in windows mac small; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=1024,1024 --screenshot="$TMP/$f.png" "file://$PWD/source-$f.svg" >/dev/null 2>&1
done
size() { magick "$TMP/$1.png" -filter Lanczos -resize "$2x$2" -strip "$3"; }

# Tauri and Linux
size small 32 32x32.png
size windows 64 64x64.png
size windows 128 128x128.png
size windows 256 128x128@2x.png
size windows 512 icon.png
# Windows Store tiles
for n in 30 44; do size small $n Square${n}x${n}Logo.png; done
for n in 71 89 107 142 150 284 310; do size windows $n Square${n}x${n}Logo.png; done
size windows 50 StoreLogo.png

# Windows .ico: small drawing up to 32 px, full tile above
for n in 16 24 32; do size small $n "$TMP/ico-$n.png"; done
for n in 48 64 128 256; do size windows $n "$TMP/ico-$n.png"; done
magick "$TMP"/ico-16.png "$TMP"/ico-24.png "$TMP"/ico-32.png "$TMP"/ico-48.png "$TMP"/ico-64.png "$TMP"/ico-128.png "$TMP"/ico-256.png icon.ico

# macOS .icns
mkdir "$TMP/icon.iconset"
for n in 16 32 128 256 512; do
  size mac $n "$TMP/icon.iconset/icon_${n}x${n}.png"
  size mac $((n * 2)) "$TMP/icon.iconset/icon_${n}x${n}@2x.png"
done
iconutil -c icns "$TMP/icon.iconset" -o icon.icns

# Website
cp source-small.svg ../../site/favicon.svg
size windows 64 ../../site/favicon.png
echo "Icons written to src-tauri/icons and site/."
