#!/usr/bin/env bash
# Run TypeORM migrations for every DB-owning service, in dependency order.
set -euo pipefail

SERVICES=("auth" "job" "cv-app" "ai")

TYPEORM="node --require ts-node/register --require tsconfig-paths/register ./node_modules/typeorm/cli.js"

for svc in "${SERVICES[@]}"; do
  echo "──────────── migrating: ${svc} ────────────"
  $TYPEORM migration:run -d "apps/${svc}/data-source.ts"
done

echo "✅ all migrations done"
