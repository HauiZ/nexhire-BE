#!/usr/bin/env bash
# Migration helper for a single service.
#
#   scripts/migration.sh generate <service> <Name>   # auto-generate from entity diff
#   scripts/migration.sh create   <service> <Name>   # empty migration (hand-write)
#   scripts/migration.sh run      <service>           # apply pending migrations
#   scripts/migration.sh revert   <service>           # roll back the last migration
#   scripts/migration.sh show     <service>           # list migration status
#
# <service> is one of: auth | job | cv-app | ai
# Example: scripts/migration.sh generate auth CreateUser
set -euo pipefail

CMD=${1:-}
SVC=${2:-}
NAME=${3:-}

TYPEORM="node --require ts-node/register --require tsconfig-paths/register ./node_modules/typeorm/cli.js"
DS="apps/${SVC}/data-source.ts"
OUT="apps/${SVC}/src/migrations/${NAME}"

usage() {
  echo "usage: scripts/migration.sh <generate|create|run|revert|show> <service> [Name]"
  echo "       service: auth | job | cv-app | ai"
  exit 1
}

[ -z "$CMD" ] || [ -z "$SVC" ] && usage

case "$CMD" in
  generate) [ -z "$NAME" ] && usage; $TYPEORM migration:generate "$OUT" -d "$DS" ;;
  create)   [ -z "$NAME" ] && usage; $TYPEORM migration:create "$OUT" ;;
  run)      $TYPEORM migration:run -d "$DS" ;;
  revert)   $TYPEORM migration:revert -d "$DS" ;;
  show)     $TYPEORM migration:show -d "$DS" ;;
  *)        usage ;;
esac
