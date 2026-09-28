#!/usr/bin/env bash
# Ejecuta las pruebas SQL contra el Supabase local (npx supabase start).
set -euo pipefail
cd "$(dirname "$0")"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -o /dev/null -f rls_and_inventory.sql 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"
