#!/usr/bin/env bash
# Тест guard-askquestion.js: блокирует AskUserQuestion, пропускает остальное.
# Запуск: bash scripts/test-guard-askquestion.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/guard-askquestion.js"
pass=0; fail=0

check() { # $1 desc, $2 expected, $3 json
  local got; got=$(printf '%s' "$3" | node "$HOOK" >/dev/null 2>&1; echo $?)
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== guard-askquestion =="
check "AskUserQuestion → блок"  2 '{"tool_name":"AskUserQuestion","tool_input":{}}'
check "Bash → пропуск"          0 '{"tool_name":"Bash","tool_input":{"command":"ls"}}'

echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
