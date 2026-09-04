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

for required_command in git mktemp rsync scp ssh tar; do
  command -v "${required_command}" >/dev/null || {
    fail "required local command is unavailable: ${required_command}"
    exit 1
  }
done

repository_root="$(git rev-parse --show-toplevel)"
readonly repository_root
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly script_directory
readonly builder="${script_directory}/build-doorbell-main-artifact.sh"
[[ -x "${builder}" ]] || {
  fail "local publisher scripts are missing"
  exit 1
}

publish_directory="$(mktemp -d "${TMPDIR:-/tmp}/doorbell-main-publish.XXXXXX")"
artifact="${publish_directory}/doorbell-main-${TARGET_SHA}.tar"
deployer_directory="${publish_directory}/control"
control_archive="${publish_directory}/control.tar"
mkdir "${deployer_directory}"
remote_suffix="${TARGET_SHA}.$$"
readonly publish_directory artifact deployer_directory control_archive remote_suffix
readonly deployer="${deployer_directory}/deploy/scripts/deploy-doorbell-main.sh"
readonly dependency_migrator="${deployer_directory}/deploy/scripts/migrate-doorbell-dependency-layer.sh"
readonly remote_artifact_stage="/tmp/doorbell-main-${remote_suffix}.tar"
readonly remote_artifact_gzip_stage="/tmp/doorbell-main-${remote_suffix}.tar.gz"
readonly remote_deployer_stage="/tmp/doorbell-deploy-main-${remote_suffix}"
readonly remote_dependency_migrator_stage="/tmp/doorbell-migrate-dependencies-${remote_suffix}"
readonly remote_artifact="/var/lib/doorbell-commons/releases/incoming/doorbell-main-${TARGET_SHA}.tar.gz"

cleanup() {
  local exit_status=$?
  trap - EXIT
  rm -rf -- "${publish_directory}"
  exit "${exit_status}"
}
trap cleanup EXIT

"${builder}" "${TARGET_SHA}" "${artifact}"
git -C "${repository_root}" archive --format=tar --output="${control_archive}" \
  "${TARGET_SHA}" \
  deploy/scripts/deploy-doorbell-main.sh \
  deploy/scripts/migrate-doorbell-dependency-layer.sh
tar --extract --file "${control_archive}" --directory "${deployer_directory}"
rm -f -- "${control_archive}"

remote_base_sha="$(ssh -- "${SSH_HOST}" "cat /opt/doorbell-commons/.doorbell-release-sha")"
readonly remote_base_sha
[[ "${remote_base_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  fail "remote runtime release marker is invalid"
  exit 1
}
git -C "${repository_root}" merge-base --is-ancestor "${remote_base_sha}" "${TARGET_SHA}" || {
  fail "remote runtime is not an ancestor of the requested release"
  exit 1
}

ssh -- "${SSH_HOST}" \
  "set -Eeuo pipefail; \
command -v gzip >/dev/null; command -v rsync >/dev/null; command -v tar >/dev/null; \
test \"\$(cat /opt/doorbell-commons/.doorbell-release-sha)\" = '${remote_base_sha}'; \
rm -f -- '${remote_artifact_stage}' '${remote_artifact_gzip_stage}'; \
tar --no-xattrs --exclude='./node_modules' --file='${remote_artifact_stage}' \
  --create --directory=/opt/doorbell-commons .; \
chmod 0600 '${remote_artifact_stage}'"

rsync --archive --checksum --no-whole-file --stats -- \
  "${artifact}" "${SSH_HOST}:${remote_artifact_stage}"
scp -- "${deployer}" "${SSH_HOST}:${remote_deployer_stage}"
scp -- "${dependency_migrator}" "${SSH_HOST}:${remote_dependency_migrator_stage}"

ssh -- "${SSH_HOST}" \
  "umask 077; \
sudo -n install -m 0755 '${remote_deployer_stage}' /usr/local/sbin/doorbell-deploy-main && \
sudo -n install -m 0755 '${remote_dependency_migrator_stage}' /usr/local/sbin/doorbell-migrate-dependencies && \
sudo -n /usr/local/sbin/doorbell-migrate-dependencies && \
sudo -n install -d -m 0700 /var/lib/doorbell-commons/releases/incoming && \
gzip -n -c '${remote_artifact_stage}' > '${remote_artifact_gzip_stage}' && \
sudo -n install -m 0600 '${remote_artifact_gzip_stage}' '${remote_artifact}' && \
rm -f -- '${remote_artifact_stage}' '${remote_artifact_gzip_stage}' \
  '${remote_deployer_stage}' '${remote_dependency_migrator_stage}' && \
sudo -n /usr/local/sbin/doorbell-deploy-main '${TARGET_SHA}' '${remote_artifact}'"

trap - EXIT
rm -rf -- "${publish_directory}"
