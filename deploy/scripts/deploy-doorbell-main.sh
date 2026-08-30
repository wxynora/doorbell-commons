#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

readonly EXPECTED_ORIGIN="https://github.com/wxynora/doorbell-commons.git"
readonly SOURCE_DIRECTORY="/opt/doorbell-commons-source"
readonly RUNTIME_DIRECTORY="/opt/doorbell-commons"
readonly DATABASE_PATH="/var/lib/doorbell-commons/doorbell.sqlite"
readonly BACKUP_ROOT="/var/backups/doorbell-commons/releases"
readonly SERVICE_NAME="doorbell-commons.service"
readonly HEALTH_URL="http://127.0.0.1:3000/api/health"
readonly HEALTH_ATTEMPTS=60

fail() {
  printf 'doorbell deployment failed: %s\n' "$*" >&2
  return 1
}

if [[ ${EUID} -ne 0 ]]; then
  fail "must run as root"
  exit 1
fi

if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  fail "usage: doorbell-deploy-main <40-character-main-sha>"
  exit 1
fi

readonly TARGET_SHA="$1"
readonly SHORT_SHA="${TARGET_SHA:0:7}"

for required_command in curl git node npm systemctl tar; do
  command -v "${required_command}" >/dev/null || {
    fail "required command is unavailable: ${required_command}"
    exit 1
  }
done

[[ -d "${SOURCE_DIRECTORY}/.git" ]] || {
  fail "missing dedicated main checkout: ${SOURCE_DIRECTORY}"
  exit 1
}
[[ -d "${RUNTIME_DIRECTORY}" ]] || {
  fail "missing current runtime: ${RUNTIME_DIRECTORY}"
  exit 1
}
[[ -f "${DATABASE_PATH}" ]] || {
  fail "missing community database: ${DATABASE_PATH}"
  exit 1
}

ACTUAL_ORIGIN="$(git -C "${SOURCE_DIRECTORY}" remote get-url origin)"
readonly ACTUAL_ORIGIN
[[ "${ACTUAL_ORIGIN}" == "${EXPECTED_ORIGIN}" ]] || {
  fail "unexpected source origin: ${ACTUAL_ORIGIN}"
  exit 1
}
[[ "$(git -C "${SOURCE_DIRECTORY}" branch --show-current)" == "main" ]] || {
  fail "source checkout must remain on main"
  exit 1
}
[[ -z "$(git -C "${SOURCE_DIRECTORY}" status --porcelain)" ]] || {
  fail "source checkout is not clean"
  exit 1
}

git -C "${SOURCE_DIRECTORY}" fetch --prune origin main
REMOTE_MAIN_SHA="$(git -C "${SOURCE_DIRECTORY}" rev-parse refs/remotes/origin/main)"
readonly REMOTE_MAIN_SHA
[[ "${TARGET_SHA}" == "${REMOTE_MAIN_SHA}" ]] || {
  fail "requested SHA is not the current origin/main"
  exit 1
}
git -C "${SOURCE_DIRECTORY}" merge-base --is-ancestor HEAD "${TARGET_SHA}" || {
  fail "source main cannot fast-forward to requested SHA"
  exit 1
}
git -C "${SOURCE_DIRECTORY}" merge --ff-only "${TARGET_SHA}"
[[ "$(git -C "${SOURCE_DIRECTORY}" rev-parse HEAD)" == "${TARGET_SHA}" ]] || {
  fail "source checkout did not reach requested SHA"
  exit 1
}

build_directory="$(mktemp -d "/opt/.doorbell-commons.build.${SHORT_SHA}.XXXXXX")"
candidate_directory="$(mktemp -d "/opt/.doorbell-commons.candidate.${SHORT_SHA}.XXXXXX")"
previous_directory=""
failed_directory=""
backup_path=""
pre_release_schema=""
service_stopped=0
runtime_moved=0
switched=0

cleanup_and_rollback() {
  local exit_status=$?
  local rollback_ok=1
  trap - EXIT

  if [[ ${exit_status} -ne 0 && ${service_stopped} -eq 1 ]]; then
    if [[ ${switched} -eq 1 ]]; then
      systemctl stop "${SERVICE_NAME}" >/dev/null 2>&1 || rollback_ok=0
      if [[ "$(systemctl show --property=ActiveState --value "${SERVICE_NAME}")" != "inactive" || \
        "$(systemctl show --property=SubState --value "${SERVICE_NAME}")" != "dead" ]]; then
        rollback_ok=0
      fi
      if [[ -n "${backup_path}" && -n "${pre_release_schema}" ]]; then
        node "${SOURCE_DIRECTORY}/deploy/scripts/restore-community-database.mjs" \
          --stopped "${backup_path}" "${pre_release_schema}" || rollback_ok=0
      else
        rollback_ok=0
      fi
      if [[ -d "${RUNTIME_DIRECTORY}" ]]; then
        mv "${RUNTIME_DIRECTORY}" "${failed_directory}" || rollback_ok=0
      fi
    fi
    if [[ ${runtime_moved} -eq 1 && -n "${previous_directory}" && \
      -d "${previous_directory}" && ! -e "${RUNTIME_DIRECTORY}" ]]; then
      mv "${previous_directory}" "${RUNTIME_DIRECTORY}" || rollback_ok=0
    fi
    if [[ ${rollback_ok} -eq 1 && -d "${RUNTIME_DIRECTORY}" ]]; then
      systemctl start "${SERVICE_NAME}" >/dev/null 2>&1 || rollback_ok=0
    fi
    if [[ ${rollback_ok} -eq 1 ]]; then
      printf 'Doorbell deployment rolled back after failure; failed candidate path: %s\n' \
        "${failed_directory}" >&2
    else
      systemctl stop "${SERVICE_NAME}" >/dev/null 2>&1 || true
      printf 'Doorbell rollback did not complete; automatic restart withheld for manual recovery.\n' >&2
    fi
  fi

  if [[ -n "${candidate_directory}" && -d "${candidate_directory}" ]]; then
    rm -rf -- "${candidate_directory}"
  fi
  if [[ -n "${build_directory}" && -d "${build_directory}" ]]; then
    rm -rf -- "${build_directory}"
  fi
  exit "${exit_status}"
}
trap cleanup_and_rollback EXIT

git -C "${SOURCE_DIRECTORY}" archive "${TARGET_SHA}" | tar -x -C "${build_directory}"
(
  cd "${build_directory}"
  npm ci
  npm run build -w @doorbell/protocol
  npm run build -w @doorbell/server
  npm run build -w @doorbell/web
  npm prune --omit=dev
)

node "${build_directory}/deploy/scripts/resolve-approved-pwa-release.mjs" \
  "${RUNTIME_DIRECTORY}/apps/web/dist/index.html" \
  "${RUNTIME_DIRECTORY}/apps/web/dist/service-worker.js" \
  "${build_directory}/apps/web/dist/index.html" \
  "${build_directory}/apps/web/dist/service-worker.js"

node "${build_directory}/deploy/scripts/merge-web-assets.mjs" \
  "${RUNTIME_DIRECTORY}/apps/web/dist/assets" \
  "${build_directory}/apps/web/dist/assets"

[[ -z "$(git -C "${SOURCE_DIRECTORY}" status --porcelain)" ]] || {
  fail "build changed tracked source files"
  exit 1
}

chmod 0755 "${candidate_directory}"
install -d -m 0755 \
  "${candidate_directory}/apps/server" \
  "${candidate_directory}/apps/web" \
  "${candidate_directory}/packages/protocol" \
  "${candidate_directory}/deploy/scripts"
cp -a \
  "${SOURCE_DIRECTORY}/package.json" \
  "${SOURCE_DIRECTORY}/package-lock.json" \
  "${build_directory}/node_modules" \
  "${candidate_directory}/"
cp -a \
  "${SOURCE_DIRECTORY}/packages/protocol/package.json" \
  "${build_directory}/packages/protocol/dist" \
  "${candidate_directory}/packages/protocol/"
cp -a \
  "${SOURCE_DIRECTORY}/apps/server/package.json" \
  "${build_directory}/apps/server/dist" \
  "${candidate_directory}/apps/server/"
cp -a "${build_directory}/apps/web/dist" "${candidate_directory}/apps/web/"
cp -a \
  "${SOURCE_DIRECTORY}/deploy/scripts/backup-community-database.mjs" \
  "${SOURCE_DIRECTORY}/deploy/scripts/restore-community-database.mjs" \
  "${candidate_directory}/deploy/scripts/"
printf '%s\n' "${TARGET_SHA}" >"${candidate_directory}/.doorbell-release-sha"
rm -rf -- "${build_directory}"
build_directory=""

node --check "${candidate_directory}/apps/server/dist/index.js"
(
  cd "${SOURCE_DIRECTORY}"
  node --input-type=module --eval '
    import { DatabaseSync } from "node:sqlite";
    const database = new DatabaseSync(process.argv[1], { readOnly: true });
    try {
      const integrity = database.prepare("PRAGMA integrity_check").all();
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
        throw new Error("community database failed integrity_check");
      }
      if (database.prepare("PRAGMA foreign_key_check").all().length !== 0) {
        throw new Error("community database failed foreign_key_check");
      }
    } finally {
      database.close();
    }
  ' "${DATABASE_PATH}"
)
pre_release_schema="$(node --input-type=module --eval '
  import { DatabaseSync } from "node:sqlite";
  const database = new DatabaseSync(process.argv[1], { readOnly: true });
  try {
    process.stdout.write(String(database.prepare("PRAGMA user_version").get().user_version));
  } finally {
    database.close();
  }
' "${DATABASE_PATH}")"
[[ "${pre_release_schema}" =~ ^[1-9][0-9]*$ ]] || {
  fail "community database schema version is invalid"
  exit 1
}

RELEASE_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly RELEASE_TIMESTAMP
readonly BACKUP_DIRECTORY="${BACKUP_ROOT}/${RELEASE_TIMESTAMP}-pre-${SHORT_SHA}"
previous_directory="${RUNTIME_DIRECTORY}.previous-${RELEASE_TIMESTAMP}"
failed_directory="${RUNTIME_DIRECTORY}.failed-${RELEASE_TIMESTAMP}"
[[ ! -e "${BACKUP_DIRECTORY}" ]] || fail "backup directory already exists"
[[ ! -e "${previous_directory}" ]] || fail "previous runtime path already exists"
[[ ! -e "${failed_directory}" ]] || fail "failed runtime path already exists"
install -d -m 0700 "${BACKUP_DIRECTORY}"
backup_path="$({ umask 077; node \
  "${SOURCE_DIRECTORY}/deploy/scripts/backup-community-database.mjs" \
  "${DATABASE_PATH}" "${BACKUP_DIRECTORY}"; })"
chmod 0600 "${backup_path}"

systemctl stop "${SERVICE_NAME}"
service_stopped=1
ACTIVE_STATE="$(systemctl show --property=ActiveState --value "${SERVICE_NAME}")"
SUB_STATE="$(systemctl show --property=SubState --value "${SERVICE_NAME}")"
readonly ACTIVE_STATE SUB_STATE
[[ "${ACTIVE_STATE}" == "inactive" && "${SUB_STATE}" == "dead" ]] || {
  fail "Doorbell service did not stop cleanly"
  exit 1
}

mv "${RUNTIME_DIRECTORY}" "${previous_directory}"
runtime_moved=1
mv "${candidate_directory}" "${RUNTIME_DIRECTORY}"
candidate_directory=""
switched=1
systemctl start "${SERVICE_NAME}"

healthy=0
for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
  if curl --fail --silent --output /dev/null "${HEALTH_URL}"; then
    healthy=1
    break
  fi
  sleep 1
done
[[ ${healthy} -eq 1 ]] || {
  fail "health check did not pass within ${HEALTH_ATTEMPTS} seconds"
  exit 1
}
systemctl is-active --quiet "${SERVICE_NAME}" || {
  fail "Doorbell service is not active after health success"
  exit 1
}

service_stopped=0
runtime_moved=0
switched=0
trap - EXIT
printf 'Doorbell main %s deployed successfully.\n' "${TARGET_SHA}"
printf 'Source checkout: %s\n' "${SOURCE_DIRECTORY}"
printf 'Previous runtime: %s\n' "${previous_directory}"
printf 'Database backup: %s\n' "${backup_path}"
