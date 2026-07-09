#!/usr/bin/env bash
set -euo pipefail

repo="bitwarden/sdk-sm"
release_json=$(mktemp)
tmpdir=$(mktemp -d)
trap 'rm -f "$release_json"; rm -rf "$tmpdir"' EXIT

curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=100" -o "$release_json"
tag=$(node -e '
  const fs = require("node:fs");
  const releases = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const release = releases.find((candidate) => candidate.tag_name?.startsWith("bws-v"));
  if (!release) process.exit(1);
  process.stdout.write(release.tag_name);
' "$release_json")
version="${tag#bws-v}"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) asset="bws-aarch64-apple-darwin-$version.zip" ;;
  Darwin-x86_64) asset="bws-x86_64-apple-darwin-$version.zip" ;;
  Linux-aarch64) asset="bws-aarch64-unknown-linux-gnu-$version.zip" ;;
  Linux-x86_64) asset="bws-x86_64-unknown-linux-gnu-$version.zip" ;;
  *) printf 'Unsupported platform: %s %s\n' "$(uname -s)" "$(uname -m)" >&2; exit 1 ;;
esac

base="https://github.com/$repo/releases/download/$tag"
curl -fsSL "$base/$asset" -o "$tmpdir/$asset"
curl -fsSL "$base/bws-sha256-checksums-$version.txt" -o "$tmpdir/checksums.txt"
cd "$tmpdir"
grep -F "  $asset" checksums.txt > selected-checksum.txt
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c selected-checksum.txt
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c selected-checksum.txt
else
  printf 'Neither shasum nor sha256sum is available.\n' >&2
  exit 1
fi
unzip -q "$asset" -d unpacked
binary=$(find unpacked -type f -name bws -print -quit)
mkdir -p "$HOME/.local/bin"
install -m 0755 "$binary" "$HOME/.local/bin/bws"
"$HOME/.local/bin/bws" --version
