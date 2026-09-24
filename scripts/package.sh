#!/bin/sh
# Zip the runtime files for Chrome Web Store upload. Not a build step: the zip contains the
# source exactly as loaded unpacked. Output: dist/graptilubear-<version>.zip
set -eu
cd "$(dirname "$0")/.."

version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' manifest.json)
[ -n "$version" ] || { echo "could not read version from manifest.json" >&2; exit 1; }

out="dist/graptilubear-$version.zip"
mkdir -p dist
rm -f "$out"
zip -qrX "$out" manifest.json src icons -x '*.DS_Store'
echo "$out"
unzip -l "$out"
