#!/usr/bin/env bash
# Тест PreToolUse-хука guard-subagent.js: блокирует Agent без shell-дисциплины,
# пропускает с дисциплиной и не-Agent инструменты.
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

echo "== guard-subagent: дисциплина делегирования =="
check "Agent с дисциплиной (Glob/Read)"  0 '{"tool_name":"Agent","tool_input":{"prompt":"Изучи через Glob/Read/Grep структуру"}}'
check "Agent с «без &&»"                  0 '{"tool_name":"Agent","tool_input":{"prompt":"делай простые команды, без && и обёрток"}}'
check "Agent БЕЗ дисциплины (блок)"       2 '{"tool_name":"Agent","tool_input":{"prompt":"разберись как устроена авторизация и почини"}}'
check "Task БЕЗ дисциплины (блок)"        2 '{"tool_name":"Task","tool_input":{"prompt":"посчитай файлы и собери отчёт"}}'
check "Не-Agent (Bash) — пропуск"         0 '{"tool_name":"Bash","tool_input":{"command":"ls"}}'

echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
