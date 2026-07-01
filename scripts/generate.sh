#!/usr/bin/env bash
# Generate migrations from entity changes across all DB-owning services.
# Each service is diffed against its own schema; services with no entity
# changes are skipped automatically.
#
#   npm run migrate:generate              # auto name "Update"
#   npm run migrate:generate -- AddPhone  # custom migration name
#
# Requires the database to be running (make dev) and reachable.
set -uo pipefail

NAME=${1:-Update}
SERVICES=(
  "auth-service"
  "candidate-service"
  "company-service"
  "job-service"
  "application-service"
  "cv-parsing-service"
  "matching-service"
  "document-storage-service"
)
TYPEORM="node --require ts-node/register --require tsconfig-paths/register ./node_modules/typeorm/cli.js"

generated=0
for svc in "${SERVICES[@]}"; do
  echo "──────────── ${svc} ────────────"
  out="apps/${svc}/src/migrations/${NAME}"
  output=$($TYPEORM migration:generate "$out" -d "apps/${svc}/data-source.ts" 2>&1)
  code=$?

  if echo "$output" | grep -qi "No changes in database schema"; then
    echo "  no entity changes — skipped"
  elif [ $code -eq 0 ]; then
    echo "$output" | grep -i "has been generated successfully" || echo "  generated"
    generated=$((generated + 1))
  else
    echo "  ✖ failed:"
    echo "$output" | tail -5
    echo ""
    echo "Hint: is the database running (make dev) and migrated up to date?"
    exit 1
  fi
done

echo ""
echo "✅ generated migration(s) for ${generated} service(s). Review the SQL, then: make migrate"
