#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

readonly RUNTIME_DIRECTORY="/opt/doorbell-commons"
readonly DEPENDENCY_DIRECTORY="/opt/doorbell-commons-deps"
readonly TEMPORARY_DIRECTORY="/opt/.doorbell-commons-deps.migrate.$$"
readonly DEPLOY_LOCK_PATH="/run/lock/doorbell-main-deploy.lock"
readonly SERVICE_NAME="doorbell-commons.service"
readonly HEALTH_URL="http://127.0.0.1:3000/api/health"
readonly HEALTH_ATTEMPTS=60

fail() {
  printf 'Doorbell dependency migration failed: %s\n' "$*" >&2
  return 1
}

if [[ ${EUID} -ne 0 ]]; then
  fail "must run as root"
  exit 1
fi

if [[ $# -ne 0 ]]; then
  fail "this migration accepts no arguments"
  exit 1
fi

for required_command in cmp cp curl flock install ln mv readlink rm sleep systemctl; do
  command -v "${required_command}" >/dev/null || {
    fail "required command is unavailable: ${required_command}"
    exit 1
  }
done

exec 9>"${DEPLOY_LOCK_PATH}"
flock --nonblock 9 || {
  fail "another Doorbell deployment is already running"
  exit 1
}

verify_persistent_layer() {
  [[ -d "${DEPENDENCY_DIRECTORY}/node_modules" && \
    -f "${DEPENDENCY_DIRECTORY}/package-lock.json" && \
    -L "${RUNTIME_DIRECTORY}/node_modules" && \
    "$(readlink "${RUNTIME_DIRECTORY}/node_modules")" == \
      "${DEPENDENCY_DIRECTORY}/node_modules" ]] || return 1
  cmp --silent \
    "${RUNTIME_DIRECTORY}/package-lock.json" \
    "${DEPENDENCY_DIRECTORY}/package-lock.json" || return 1
  for workspace_name in protocol server web; do
    case "${workspace_name}" in
      protocol) expected_target="${RUNTIME_DIRECTORY}/packages/protocol" ;;
      server) expected_target="${RUNTIME_DIRECTORY}/apps/server" ;;
      web) expected_target="${RUNTIME_DIRECTORY}/apps/web" ;;
    esac
    workspace_link="${DEPENDENCY_DIRECTORY}/node_modules/@doorbell/${workspace_name}"
    [[ -L "${workspace_link}" && "$(readlink "${workspace_link}")" == "${expected_target}" ]] || \
      return 1
  done
}

if [[ -e "${DEPENDENCY_DIRECTORY}" ]]; then
  verify_persistent_layer || {
    fail "an incomplete persistent dependency layer already exists"
    exit 1
  }
  printf 'Doorbell dependency layer is already migrated.\n'
  exit 0
fi

[[ -d "${RUNTIME_DIRECTORY}" && -f "${RUNTIME_DIRECTORY}/package-lock.json" ]] || {
  fail "current runtime is incomplete"
  exit 1
}
[[ -d "${RUNTIME_DIRECTORY}/node_modules" && ! -L "${RUNTIME_DIRECTORY}/node_modules" ]] || {
  fail "current runtime dependencies are not one movable real directory"
  exit 1
}
[[ ! -e "${TEMPORARY_DIRECTORY}" ]] || {
  fail "temporary dependency migration path already exists"
  exit 1
}
systemctl is-active --quiet "${SERVICE_NAME}" || {
  fail "Doorbell service must be active before dependency migration"
  exit 1
}

declare -A original_workspace_targets=()
for workspace_name in protocol server web; do
  workspace_link="${RUNTIME_DIRECTORY}/node_modules/@doorbell/${workspace_name}"
  [[ -L "${workspace_link}" ]] || {
    fail "current workspace link is missing: @doorbell/${workspace_name}"
    exit 1
  }
  original_workspace_targets["${workspace_name}"]="$(readlink "${workspace_link}")"
done

service_stopped=0
dependencies_moved=0
dependency_directory_installed=0
runtime_link_installed=0

rollback() {
  local exit_status=$?
  trap - EXIT
  if [[ ${exit_status} -ne 0 ]]; then
    if [[ ${service_stopped} -eq 1 ]]; then
      systemctl stop "${SERVICE_NAME}" >/dev/null 2>&1 || true
    fi
    if [[ ${runtime_link_installed} -eq 1 && -L "${RUNTIME_DIRECTORY}/node_modules" ]]; then
      rm -f -- "${RUNTIME_DIRECTORY}/node_modules"
    fi
    if [[ ${dependency_directory_installed} -eq 1 && \
      -d "${DEPENDENCY_DIRECTORY}/node_modules" && \
      ! -e "${RUNTIME_DIRECTORY}/node_modules" ]]; then
      mv "${DEPENDENCY_DIRECTORY}/node_modules" "${RUNTIME_DIRECTORY}/node_modules"
      rm -rf -- "${DEPENDENCY_DIRECTORY}"
    elif [[ ${dependencies_moved} -eq 1 && \
      -d "${TEMPORARY_DIRECTORY}/node_modules" && \
      ! -e "${RUNTIME_DIRECTORY}/node_modules" ]]; then
      mv "${TEMPORARY_DIRECTORY}/node_modules" "${RUNTIME_DIRECTORY}/node_modules"
      rm -rf -- "${TEMPORARY_DIRECTORY}"
    fi
    if [[ -d "${RUNTIME_DIRECTORY}/node_modules/@doorbell" ]]; then
      for workspace_name in protocol server web; do
        workspace_link="${RUNTIME_DIRECTORY}/node_modules/@doorbell/${workspace_name}"
        rm -f -- "${workspace_link}"
        ln -s "${original_workspace_targets[$workspace_name]}" "${workspace_link}"
      done
    fi
    if [[ ${service_stopped} -eq 1 ]]; then
      systemctl start "${SERVICE_NAME}" >/dev/null 2>&1 || true
    fi
    fail "migration rolled back; persistent dependency layer was not activated"
  fi
  exit "${exit_status}"
}
trap rollback EXIT

systemctl stop "${SERVICE_NAME}"
service_stopped=1
[[ "$(systemctl show --property=ActiveState --value "${SERVICE_NAME}")" == "inactive" && \
  "$(systemctl show --property=SubState --value "${SERVICE_NAME}")" == "dead" ]] || {
  fail "Doorbell service did not stop cleanly"
  exit 1
}

install -d -m 0755 "${TEMPORARY_DIRECTORY}"
mv "${RUNTIME_DIRECTORY}/node_modules" "${TEMPORARY_DIRECTORY}/node_modules"
dependencies_moved=1
cp "${RUNTIME_DIRECTORY}/package-lock.json" "${TEMPORARY_DIRECTORY}/package-lock.json"

for workspace_name in protocol server web; do
  case "${workspace_name}" in
    protocol) expected_target="${RUNTIME_DIRECTORY}/packages/protocol" ;;
    server) expected_target="${RUNTIME_DIRECTORY}/apps/server" ;;
    web) expected_target="${RUNTIME_DIRECTORY}/apps/web" ;;
  esac
  workspace_link="${TEMPORARY_DIRECTORY}/node_modules/@doorbell/${workspace_name}"
  rm -f -- "${workspace_link}"
  ln -s "${expected_target}" "${workspace_link}"
done

mv "${TEMPORARY_DIRECTORY}" "${DEPENDENCY_DIRECTORY}"
dependency_directory_installed=1
ln -s "${DEPENDENCY_DIRECTORY}/node_modules" "${RUNTIME_DIRECTORY}/node_modules"
runtime_link_installed=1
verify_persistent_layer || {
  fail "installed dependency layer failed verification"
  exit 1
}

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
  fail "health check did not pass after dependency migration"
  exit 1
}
systemctl is-active --quiet "${SERVICE_NAME}" || {
  fail "Doorbell service is not active after dependency migration"
  exit 1
}

service_stopped=0
dependencies_moved=0
dependency_directory_installed=0
runtime_link_installed=0
trap - EXIT
printf 'Doorbell dependency layer migrated successfully.\n'
