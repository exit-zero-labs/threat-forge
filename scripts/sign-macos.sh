#!/bin/bash
# Import temporary CI credentials, sign nested code first, notarize final containers.
set -euo pipefail
set +x
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 1 ]] || fail 'Usage: sign-macos.sh <target>'
case "$1" in aarch64-apple-darwin|x86_64-apple-darwin) ;; *) fail 'Unsupported macOS target' ;; esac
for name in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_API_PRIVATE_KEY APPLE_SIGNING_IDENTITY APPLE_API_KEY APPLE_API_ISSUER APPLE_TEAM_ID RUNNER_TEMP; do
  [[ -n "${!name:-}" ]] || fail "Required signing input missing: $name"
done
[[ "$APPLE_TEAM_ID" == Q4N97LZS6U ]] || fail 'Unexpected Apple team'
[[ "$APPLE_SIGNING_IDENTITY" == 'Developer ID Application: Exit Zero Labs LLC (Q4N97LZS6U)' ]] || fail 'Unexpected Apple signing identity'
cd "$(dirname "$0")/.."
umask 077
work=$(mktemp -d "$RUNNER_TEMP/threatforge-signing.XXXXXX")
keychain="$work/signing.keychain-db"
# Security emits quoted paths; Python parses them without executing shell text.
created=false
changed=false
cleanup() {
  local status=$?
  trap - EXIT
  local paths=() path
  if $changed; then
    while IFS= read -r path; do paths+=("$path"); done < <(python3 -c 'import shlex,sys; print("\n".join(shlex.split(open(sys.argv[1]).read())))' "$work/search-list")
    security list-keychains -d user -s "${paths[@]}" >/dev/null || status=1
    path=$(python3 -c 'import shlex,sys; print(shlex.split(open(sys.argv[1]).read())[0])' "$work/default-keychain")
    security default-keychain -d user -s "$path" >/dev/null || status=1
  fi
  if $created; then security delete-keychain "$keychain" >/dev/null || status=1; fi
  rm -rf "$work" || status=1
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
security list-keychains -d user > "$work/search-list"
security default-keychain -d user > "$work/default-keychain"
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$work/certificate.p12"
printf '%s' "$APPLE_API_PRIVATE_KEY" | base64 --decode > "$work/notary.p8"
keychain_password=$(openssl rand -hex 32)
security create-keychain -p "$keychain_password" "$keychain"
created=true
security unlock-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security import "$work/certificate.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
changed=true
security list-keychains -d user -s "$keychain"
security default-keychain -d user -s "$keychain"
identities=$(security find-identity -v -p codesigning "$keychain")
[[ "$identities" == *"\"$APPLE_SIGNING_IDENTITY\""* ]] || fail 'Approved signing identity is absent from imported certificate'
# Resolve to the imported certificate fingerprint, avoiding same-name legacy identities.
fingerprint=$(printf '%s\n' "$identities" | awk -v name="$APPLE_SIGNING_IDENTITY" 'index($0,"\"" name "\"") {print $2}')
[[ "$fingerprint" =~ ^[A-Fa-f0-9]{40}$ ]] || fail 'Expected exactly one imported signing identity'
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_API_PRIVATE_KEY
npm run tauri -- build --target "$1" --no-bundle -- --frozen
helper="src-tauri/target/$1/release/threatforge-mcp"
[[ -f "$helper" ]] || fail 'Compiled MCP helper missing'
codesign --force --timestamp --options runtime --keychain "$keychain" --sign "$fingerprint" "$helper"
codesign --verify --strict "$helper"
helper_details=$(codesign -dv --verbose=4 "$helper" 2>&1)
[[ "$helper_details" == *"Authority=$APPLE_SIGNING_IDENTITY"* && "$helper_details" == *"TeamIdentifier=$APPLE_TEAM_ID"* && "$helper_details" == *'(runtime)'* && "$helper_details" == *'Timestamp='* ]] || fail 'MCP helper signing metadata is invalid'
case "$1" in aarch64-apple-darwin) expected_arch=arm64 ;; *) expected_arch=x86_64 ;; esac
[[ "$(lipo -archs "$helper")" == "$expected_arch" ]] || fail 'MCP helper has the wrong architecture'
APPLE_SIGNING_IDENTITY="$fingerprint" APPLE_API_KEY_PATH="$work/notary.p8" npm run tauri -- bundle --target "$1" --bundles app,dmg
version=$(node -p 'require("./src-tauri/tauri.conf.json").version')
case "$1" in aarch64-apple-darwin) suffix=aarch64 ;; *) suffix=x64 ;; esac
dmg="src-tauri/target/$1/release/bundle/dmg/Threat Forge_${version}_${suffix}.dmg"
[[ -f "$dmg" ]] || fail 'Final DMG missing'
evidence="$RUNNER_TEMP/macos-signing-evidence-$1"
mkdir -p "$evidence"
codesign --force --timestamp --keychain "$keychain" --sign "$fingerprint" "$dmg"
xcrun notarytool submit "$dmg" --key "$work/notary.p8" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait --output-format json > "$evidence/dmg-notarization.json"
if ! python3 -c 'import json,sys; result=json.load(open(sys.argv[1])); sys.exit(0 if result.get("status")=="Accepted" and result.get("id") else 1)' "$evidence/dmg-notarization.json"; then
  submission_id=$(python3 -c 'import json,sys,uuid; print(uuid.UUID(json.load(open(sys.argv[1]))["id"]))' "$evidence/dmg-notarization.json")
  xcrun notarytool log "$submission_id" --key "$work/notary.p8" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" > "$evidence/dmg-notarization-log.json"
  fail 'Final DMG notarization was not Accepted; inspect notarization evidence'
fi
xcrun stapler staple "$dmg"
archive="src-tauri/target/$1/release/bundle/macos/Threat.Forge_${suffix}.app.tar.gz"
tar -czf "$archive" -C "src-tauri/target/$1/release/bundle/macos" "Threat Forge.app"
bash scripts/verify-macos-signing.sh "$1" "$evidence"
