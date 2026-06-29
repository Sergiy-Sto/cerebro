#!/usr/bin/env bash
# Тест Stop-хука capitulation-check.js после тюнинга:
# не флагать 👉/«ограничение»/исследование субагентом; флагать реальную капитуляцию.
# Запуск: bash scripts/test-capitulation.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/capitulation-check.js"
TMP="_tc.jsonl"
pass=0; fail=0
USER='{"type":"user","message":{"content":"тест"}}'

# $1 описание, $2 ожидаемый код (0=не флаг, 2=флаг), $3 JSON-массив content ассистента
check() {
  printf '%s\n{"type":"assistant","message":{"content":%s}}\n' "$USER" "$3" > "$TMP"
  printf '{"transcript_path":"%s","stop_hook_active":false}' "$TMP" | node "$HOOK" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== capitulation-check: после тюнинга =="
check "👉 в концовке (не капит.)"        0 '[{"type":"text","text":"готово. 👉 когда дашь доступ — начнём"}]'
check "слово ограничение (обсуждение)"    0 '[{"type":"text","text":"это ограничение системы, я его проверил"}]'
check "не могу + нет доступа (капит.)"     2 '[{"type":"text","text":"не могу, нет доступа к серверу"}]'
check "не могу + субагент Agent"           0 '[{"type":"text","text":"пока не могу"},{"type":"tool_use","name":"Agent","input":{}}]'
check "не могу + WebSearch"                0 '[{"type":"text","text":"не могу"},{"type":"tool_use","name":"WebSearch","input":{}}]'
check "проверь у себя (капит.)"            2 '[{"type":"text","text":"проверь у себя и скажи"}]'
check "TaskCreate НЕ считается поиском"     2 '[{"type":"text","text":"не могу"},{"type":"tool_use","name":"TaskCreate","input":{}}]'
check "«проверишь только ты» (капит.)"      2 '[{"type":"text","text":"моб-залогиненный вид проверишь только ты"}]'
check "«без твоей сессии» (капит.)"         2 '[{"type":"text","text":"playwright дал бы моб, но без твоей сессии не залогинен"}]'
check "продуктовый выбор (искл., не флаг)"  0 '[{"type":"text","text":"тебе нужно проверить, какой вариант заголовка лучше"}]'

rm -f "$TMP"
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
