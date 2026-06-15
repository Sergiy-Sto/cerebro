#!/usr/bin/env bash
# Тест PreToolUse-хука guard-subagent.js: РЕТАЙРНУТ (no-op) — всё проходит (exit 0).
# Запуск: bash scripts/test-subagent.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/guard-subagent.js"
pass=0; fail=0

# $1 описание, $2 ожидаемый код (0=пропуск, 2=блок), $3 JSON-инпут PreToolUse
check() {
  printf '%s' "$3" | node "$HOOK" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== guard-subagent: РЕТАЙРНУТ (no-op — всё проходит) =="
check "Agent без дисциплины — пропуск"    0 '{"tool_name":"Agent","tool_input":{"prompt":"разберись как устроена авторизация и почини"}}'
check "Task без дисциплины — пропуск"      0 '{"tool_name":"Task","tool_input":{"prompt":"посчитай файлы и собери отчёт"}}'
check "Не-Agent (Bash) — пропуск"         0 '{"tool_name":"Bash","tool_input":{"command":"ls"}}'

echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
