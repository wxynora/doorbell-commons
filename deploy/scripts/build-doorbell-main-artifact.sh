#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

readonly EXPECTED_HTTPS_ORIGIN="https://github.com/wxynora/doorbell-commons.git"
readonly EXPECTED_SSH_ORIGIN="git@github.com:wxynora/doorbell-commons.git"
fail() {
  printf 'doorbell artifact build failed: %s\n' "$*" >&2
  return 1
}

if [[ $# -ne 2 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  fail "usage: build-doorbell-main-artifact <40-character-main-sha> <output.tar.gz>"
  exit 1
fi

readonly TARGET_SHA="$1"
readonly OUTPUT_PATH="$2"

for required_command in git node npm tar; do
  command -v "${required_command}" >/dev/null || {
    fail "required local command is unavailable: ${required_command}"
    exit 1
  }
done

repository_root="$(git rev-parse --show-toplevel)"
readonly repository_root
actual_origin="$(git -C "${repository_root}" remote get-url origin)"
readonly actual_origin
case "${actual_origin}" in
  "${EXPECTED_HTTPS_ORIGIN}" | "${EXPECTED_SSH_ORIGIN}") ;;
  *)
    fail "unexpected source origin"
    exit 1
    ;;
esac

git -C "${repository_root}" fetch --prune origin main
remote_main_sha="$(git -C "${repository_root}" rev-parse refs/remotes/origin/main)"
readonly remote_main_sha
[[ "${TARGET_SHA}" == "${remote_main_sha}" ]] || {
  fail "requested SHA is not the current origin/main"
  exit 1
}

output_parent="$(dirname "${OUTPUT_PATH}")"
[[ -d "${output_parent}" ]] || {
  fail "output directory does not exist: ${output_parent}"
  exit 1
}

build_directory="$(mktemp -d "${TMPDIR:-/tmp}/doorbell-main-build.XXXXXX")"
runtime_directory="$(mktemp -d "${TMPDIR:-/tmp}/doorbell-main-runtime.XXXXXX")"
source_archive="${build_directory}/source.tar"
temporary_output="${OUTPUT_PATH}.tmp.$$"

cleanup() {
  local exit_status=$?
  trap - EXIT
  rm -rf -- "${build_directory}" "${runtime_directory}"
  rm -f -- "${temporary_output}"
  exit "${exit_status}"
}
trap cleanup EXIT

git -C "${repository_root}" archive --format=tar --output="${source_archive}" "${TARGET_SHA}"
tar --extract --file "${source_archive}" --directory "${build_directory}"
rm -f -- "${source_archive}"

(
  cd "${build_directory}"
  npm ci
  npm run build -w @doorbell/protocol
  npm run build -w @doorbell/server
  npm run build -w @doorbell/web
)

install -d -m 0755 \
  "${runtime_directory}/apps/server" \
  "${runtime_directory}/apps/web" \
  "${runtime_directory}/packages/protocol" \
  "${runtime_directory}/deploy/scripts"
cp -a \
  "${build_directory}/package.json" \
  "${build_directory}/package-lock.json" \
  "${runtime_directory}/"
cp -a \
  "${build_directory}/packages/protocol/package.json" \
  "${build_directory}/packages/protocol/dist" \
  "${runtime_directory}/packages/protocol/"
cp -a \
  "${build_directory}/apps/server/package.json" \
  "${build_directory}/apps/server/dist" \
  "${runtime_directory}/apps/server/"
cp -a "${build_directory}/apps/web/dist" "${runtime_directory}/apps/web/"
cp -a \
  "${build_directory}/deploy/scripts/backup-community-database.mjs" \
  "${build_directory}/deploy/scripts/cleanup-doorbell-release-state.mjs" \
  "${build_directory}/deploy/scripts/merge-web-assets.mjs" \
  "${build_directory}/deploy/scripts/resolve-approved-pwa-release.mjs" \
  "${build_directory}/deploy/scripts/restore-community-database.mjs" \
  "${build_directory}/deploy/scripts/verify-doorbell-runtime-artifact.mjs" \
  "${runtime_directory}/deploy/scripts/"

printf '%s\n' \
  "{\"schema\":2,\"source_sha\":\"${TARGET_SHA}\",\"node_major\":24,\"dependency_mode\":\"reuse-exact-lock\"}" \
  >"${runtime_directory}/.doorbell-runtime-artifact.json"
printf '%s\n' "${TARGET_SHA}" >"${runtime_directory}/.doorbell-release-sha"

COPYFILE_DISABLE=1 tar --no-xattrs -czf "${temporary_output}" -C "${runtime_directory}" .
mv "${temporary_output}" "${OUTPUT_PATH}"
trap - EXIT
rm -rf -- "${build_directory}" "${runtime_directory}"
printf 'Built Doorbell application artifact: %s\n' "${OUTPUT_PATH}"
