#!/usr/bin/env bash
# Reuse the current release's native artifact unless its build inputs changed.
set -Eeuo pipefail

fail() { printf 'Mahjong native preparation failed: %s\n' "$*" >&2; exit 1; }

native_mode() {
  local repository="$1" base="$2" target="$3" result
  [[ "${base}" =~ ^[0-9a-f]{40}$ && "${target}" =~ ^[0-9a-f]{40}$ ]] ||
    fail 'a verified base SHA and target SHA are required; do not guess a reuse baseline'
  git -C "${repository}" merge-base --is-ancestor "${base}" "${target}" ||
    fail 'native baseline is not an ancestor of the target'
  if git -C "${repository}" diff --quiet "${base}" "${target}" -- \
    games/mahjong/third_party/pymahjonggb \
    deploy/scripts/build-mahjong-native.sh \
    deploy/scripts/verify-mahjong-native.py; then
    printf 'reuse\n'
  else
    result=$?
    [[ "${result}" -eq 1 ]] || fail 'could not compare native build inputs'
    printf 'build\n'
  fi
}

if [[ "${1:-}" == --mode ]]; then
  [[ $# -eq 4 ]] || fail 'usage: prepare-mahjong-native --mode <repository> <base-sha> <target-sha>'
  native_mode "$2" "$3" "$4"
  exit
fi

[[ $# -eq 4 ]] || fail 'usage: prepare-mahjong-native <repository> <target-source> <output> <target-sha>'
repository="$1" source_root="$2" output="$3" target="$4"
mode="$(native_mode "${repository}" "${DOORBELL_NATIVE_BASE_SHA:-}" "${target}")"
if [[ "${mode}" == build ]]; then
  bash "${source_root}/deploy/scripts/build-mahjong-native.sh" "${source_root}" "${output}"
else
  reuse="${DOORBELL_NATIVE_REUSE_DIRECTORY:-}"
  [[ -n "${reuse}" && -s "${reuse}/MahjongGB.abi3.so" && -s "${reuse}/manifest.json" ]] ||
    fail 'unchanged native dependency is missing; restore the baseline artifact before publishing'
  node --input-type=module - "${reuse}" "${DOORBELL_NATIVE_PLATFORM:-linux/amd64}" <<'VERIFY'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [root, platform] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const machine = { 'linux/amd64': 'x86_64', 'linux/arm64': 'aarch64' }[platform];
const binary = readFileSync(join(root, 'MahjongGB.abi3.so'));
if (!machine || manifest.schema !== 1 || manifest.platform !== 'linux' ||
    manifest.machine !== machine || manifest.abi !== 'abi3' ||
    manifest.minimum_python !== '3.10' || manifest.profile !== 'dazhong-friend-144-v1' ||
    binary.length < 20 || binary.readUInt32BE(0) !== 0x7f454c46 || binary[4] !== 2 ||
    binary[5] !== 1 || binary.readUInt16LE(18) !== (machine === 'x86_64' ? 62 : 183)) {
  throw new Error('baseline native artifact does not match the target Linux platform/profile');
}
VERIFY
  mkdir -p "${output}"
  cp -a "${reuse}/MahjongGB.abi3.so" "${reuse}/manifest.json" "${output}/"
fi

[[ -s "${output}/MahjongGB.abi3.so" && -s "${output}/manifest.json" ]] ||
  fail 'native preparation did not produce both required runtime files'
printf 'Mahjong native dependency: %s\n' "${mode}"
