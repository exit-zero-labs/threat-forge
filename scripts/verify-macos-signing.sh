#!/bin/bash
# Verify final distribution bytes without signing or submitting them to Apple.
set -euo pipefail
set +x
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 2 ]] || fail 'Usage: verify-macos-signing.sh <target> <evidence-dir>'
case "$1" in
  aarch64-apple-darwin) arch=arm64; suffix=aarch64 ;;
  x86_64-apple-darwin) arch=x86_64; suffix=x64 ;;
  *) fail 'Unsupported macOS target' ;;
esac
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"
: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required}"
[[ "$APPLE_TEAM_ID" == Q4N97LZS6U ]] || fail 'Unexpected Apple team'
[[ "$APPLE_SIGNING_IDENTITY" == 'Developer ID Application: Exit Zero Labs LLC (Q4N97LZS6U)' ]] || fail 'Unexpected Apple signing identity'
cd "$(dirname "$0")/.."
version=$(node -p 'require("./src-tauri/tauri.conf.json").version')
base="src-tauri/target/$1/release/bundle"
app="$base/macos/Threat Forge.app"
dmg="$base/dmg/Threat Forge_${version}_${suffix}.dmg"
[[ -d "$app" && -f "$dmg" ]] || fail 'Expected app and DMG are missing'
mkdir -p "$2"
evidence=$(cd "$2" && pwd)
verify_code() {
  local path=$1 executable=$2 label=$3 details
  codesign --verify --strict --verbose=2 "$path"
  details=$(codesign -dv --verbose=4 "$path" 2>&1)
  printf '%s\n' "$details" | sed '/^Executable=/d' > "$evidence/$label-signature.txt"
  printf '%s\n' "$details" | grep -Fxq "Authority=$APPLE_SIGNING_IDENTITY" || fail "$label: wrong publisher"
  printf '%s\n' "$details" | grep -Fxq "TeamIdentifier=$APPLE_TEAM_ID" || fail "$label: wrong team"
  [[ "$details" == *'Timestamp='* ]] || fail "$label: secure timestamp missing"
  if [[ -n "$executable" ]]; then
    [[ "$details" == *'(runtime)'* ]] || fail "$label: hardened runtime missing"
    [[ "$(lipo -archs "$executable")" == "$arch" ]] || fail "$label: wrong architecture"
  fi
}
verify_app() {
  local path=$1 label=$2
  [[ -f "$path/Contents/MacOS/threat-forge" && -f "$path/Contents/MacOS/threatforge-mcp" ]] || fail "$label: executable missing"
  verify_code "$path/Contents/MacOS/threatforge-mcp" "$path/Contents/MacOS/threatforge-mcp" "$label-helper"
  verify_code "$path" "$path/Contents/MacOS/threat-forge" "$label-app"
  codesign --verify --deep --strict --verbose=2 "$path"
  spctl --assess --type execute --verbose=4 "$path" 2> "$evidence/$label-gatekeeper.txt"
  xcrun stapler validate "$path" > "$evidence/$label-ticket.txt"
}
verify_app "$app" bundle
verify_code "$dmg" '' dmg
xcrun stapler validate "$dmg" > "$evidence/dmg-ticket.txt"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg" 2> "$evidence/dmg-gatekeeper.txt"
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/threatforge-verify.XXXXXX")
mounted=false
archive_dir=
cleanup() {
  local status=$?
  trap - EXIT
  if $mounted; then hdiutil detach "$mount_dir" >/dev/null || status=1; fi
  rmdir "$mount_dir" || status=1
  if [[ -n "$archive_dir" ]]; then rm -rf "$archive_dir" || status=1; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# The repository-owned DMG presents its bundled LICENSE before mounting.
printf 'Y\n' | hdiutil attach "$dmg" -readonly -nobrowse -mountpoint "$mount_dir" >/dev/null
mounted=true
verify_app "$mount_dir/Threat Forge.app" mounted
shasum -a 256 "$dmg" > "$evidence/SHA256SUMS"
archive="$base/macos/Threat.Forge_${suffix}.app.tar.gz"
if [[ -f "$archive" ]]; then
  archive_dir=$(mktemp -d "${TMPDIR:-/tmp}/threatforge-archive.XXXXXX")
  # Only the archive just created from the verified app is a release candidate.
  python3 - "$archive" "$archive_dir" <<'PYTHON'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], "r:gz") as archive:
    members = archive.getmembers()
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] not in ("Threat Forge.app", "._Threat Forge.app") or not (member.isfile() or member.isdir()):
            raise SystemExit("App archive contains an unexpected entry")
PYTHON
  # BSD tar restores AppleDouble metadata, including the stapled app ticket.
  tar -xzf "$archive" -C "$archive_dir"
  verify_app "$archive_dir/Threat Forge.app" archive
  shasum -a 256 "$archive" >> "$evidence/SHA256SUMS"
fi
printf 'Verified %s distribution\n' "$arch"
