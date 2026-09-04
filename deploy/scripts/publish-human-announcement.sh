#!/usr/bin/env bash
set -euo pipefail

readonly RUNTIME_DIRECTORY="/opt/doorbell-commons"
readonly DATABASE_PATH="/var/lib/doorbell-commons/doorbell.sqlite"
readonly DATABASE_ENVIRONMENT_NAME="DOORBELL_HUMAN_ANNOUNCEMENT_DATABASE_PATH"

if [[ "${EUID}" -ne 0 ]]; then
  echo "publish-human-announcement.sh must run as root" >&2
  exit 1
fi

exec runuser -u doorbell -- env \
  "${DATABASE_ENVIRONMENT_NAME}=${DATABASE_PATH}" \
  /usr/bin/node \
  "${RUNTIME_DIRECTORY}/apps/server/dist/human-announcement-cli.js" \
  "$@"
