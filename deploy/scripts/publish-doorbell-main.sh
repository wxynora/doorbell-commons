#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

fail() {
  printf 'doorbell publish failed: %s\n' "$*" >&2
  return 1
}

if [[ $# -ne 2 || ! $1 =~ ^[0-9a-f]{40}$ || -z $2 ]]; then
  fail "usage: publish-doorbell-main <40-character-main-sha> <ssh-host>"
  exit 1
fi

readonly TARGET_SHA="$1"
readonly SSH_HOST="$2"

for required_command in git scp ssh; do
  command -v "${required_command}" >/dev/null || {
    fail "required local command is unavailable: ${required_command}"
    exit 1
  }
done

repository_root="$(git rev-parse --show-toplevel)"
readonly repository_root
readonly builder="${repository_root}/deploy/scripts/build-doorbell-main-artifact.sh"
[[ -x "${builder}" ]] || {
  fail "local publisher scripts are missing"
  exit 1
}

artifact="$(mktemp "${TMPDIR:-/tmp}/doorbell-main-${TARGET_SHA}.XXXXXX.tar.gz")"
deployer_directory="$(mktemp -d "${TMPDIR:-/tmp}/doorbell-main-deployer.XXXXXX")"
remote_suffix="${TARGET_SHA}.$$"
readonly artifact deployer_directory remote_suffix
readonly deployer="${deployer_directory}/deploy/scripts/deploy-doorbell-main.sh"
readonly dependency_migrator="${deployer_directory}/deploy/scripts/migrate-doorbell-dependency-layer.sh"
readonly remote_artifact_stage="/tmp/doorbell-main-${remote_suffix}.tar.gz"
readonly remote_deployer_stage="/tmp/doorbell-deploy-main-${remote_suffix}"
readonly remote_dependency_migrator_stage="/tmp/doorbell-migrate-dependencies-${remote_suffix}"
readonly remote_artifact="/var/lib/doorbell-commons/releases/incoming/doorbell-main-${TARGET_SHA}.tar.gz"

cleanup() {
  local exit_status=$?
  trap - EXIT
  rm -f -- "${artifact}"
  rm -rf -- "${deployer_directory}"
  exit "${exit_status}"
}
trap cleanup EXIT

"${builder}" "${TARGET_SHA}" "${artifact}"
git -C "${repository_root}" archive "${TARGET_SHA}" \
  deploy/scripts/deploy-doorbell-main.sh \
  deploy/scripts/migrate-doorbell-dependency-layer.sh | \
  tar -x -C "${deployer_directory}"

scp -- "${artifact}" "${SSH_HOST}:${remote_artifact_stage}"
scp -- "${deployer}" "${SSH_HOST}:${remote_deployer_stage}"
scp -- "${dependency_migrator}" "${SSH_HOST}:${remote_dependency_migrator_stage}"

ssh -- "${SSH_HOST}" \
  "sudo -n install -m 0755 '${remote_deployer_stage}' /usr/local/sbin/doorbell-deploy-main && \
sudo -n install -m 0755 '${remote_dependency_migrator_stage}' /usr/local/sbin/doorbell-migrate-dependencies && \
sudo -n /usr/local/sbin/doorbell-migrate-dependencies && \
sudo -n install -d -m 0700 /var/lib/doorbell-commons/releases/incoming && \
sudo -n install -m 0600 '${remote_artifact_stage}' '${remote_artifact}' && \
rm -f -- '${remote_artifact_stage}' '${remote_deployer_stage}' '${remote_dependency_migrator_stage}' && \
sudo -n /usr/local/sbin/doorbell-deploy-main '${TARGET_SHA}' '${remote_artifact}'"

trap - EXIT
rm -f -- "${artifact}"
rm -rf -- "${deployer_directory}"
