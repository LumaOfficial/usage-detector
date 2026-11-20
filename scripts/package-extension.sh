#!/bin/sh
# Package the whole Manifest V3 extension into a single uploadable zip.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/extension/manifest.json" | head -1)

if [ -z "$version" ]; then
  echo "Could not read the version from extension/manifest.json" >&2
  exit 1
fi

mkdir -p "$root/dist"
output="$root/dist/usage-detector-$version.zip"
rm -f "$output"

if command -v zip >/dev/null 2>&1; then
  (cd "$root/extension" && zip -qr "$output" . -x '.*')
else
  python3 - "$root/extension" "$output" <<'PY'
import os
import sys
import zipfile

source, output = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for base, dirs, files in os.walk(source):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(base, name)
            archive.write(full, os.path.relpath(full, source))
PY
fi

echo "$output"
