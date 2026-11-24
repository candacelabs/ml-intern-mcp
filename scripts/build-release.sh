#!/bin/sh
# Build the portable server archive from the npm package and its locked dependencies.
set -eu
out=${1:?Usage: scripts/build-release.sh OUTPUT_DIRECTORY}
mkdir -p "$out"
out=$(cd "$out" && pwd)
cd "$(dirname "$0")/.."
version=$(node -p 'require("./package.json").version')
grep -Fx "    version=$version" scripts/install.sh >/dev/null || { echo 'Set matching package and installer versions.' >&2; exit 1; }
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
trap 'exit 1' HUP INT TERM
package=$(npm pack --silent --pack-destination "$stage")
tar -xzf "$stage/$package" -C "$stage"
cp package-lock.json "$stage/package/"
(cd "$stage/package" && npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund)
# The optional native accelerators are platform-specific. The portable server uses JS.
if find "$stage/package" -name '*.node' -print | grep -q .; then
    echo 'Found an unexpected native module in the portable archive.' >&2; exit 1
fi
tar -czf "$out/ml-intern-mcp.tar.gz" -C "$stage/package" .
cp scripts/install.sh "$out/install.sh"
(cd "$out" && sha256sum ml-intern-mcp.tar.gz install.sh > SHA256SUMS)
