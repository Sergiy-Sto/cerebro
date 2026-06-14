#!/usr/bin/env bash
# Тест guard-files.js: блок правок защищённых путей (.env/secrets/ключи).
# Запуск: bash scripts/test-guard-files.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/guard-files.js"
pass=0; fail=0

# $1 описание, $2 JSON-значение пути, $3 ожидаемый код (0=ок, 2=блок)
check() {
  printf '{"tool_input":{"file_path":%s}}' "$2" | node "$HOOK" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$3" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$3 факт=$got"; fail=$((fail+1)); fi
}

echo "== guard-files: защищённые пути =="
check ".env (блок)"          '".env"'                    2
check ".env.production (блок)" '"config/.env.production"' 2
check "secrets/ (блок)"      '"secrets/key.txt"'         2
check ".pem ключ (блок)"     '"certs/server.pem"'        2
check "обычный файл (ок)"    '"src/index.js"'            0

echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
