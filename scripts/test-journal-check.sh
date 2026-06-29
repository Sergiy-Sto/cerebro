#!/usr/bin/env bash
# Тест Stop-хука journal-check.js после фикса: фиксацией считается запись в ЖУРНАЛ.
# Запуск: bash scripts/test-journal-check.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/journal-check.js"
STATE=".claude/journal-check-state.json"
TMP="_jc.jsonl"
pass=0; fail=0
USER='{"type":"user","message":{"content":"go"}}'

tu() { printf '{"type":"tool_use","name":"%s","input":{"file_path":"%s"}}' "$1" "$2"; }

# $1 описание, $2 ожидаемый код (0=не флаг, 2=флаг), $3 JSON-массив content ассистента
check() {
  rm -f "$STATE"
  printf '%s\n{"type":"assistant","message":{"content":%s}}\n' "$USER" "$3" > "$TMP"
  printf '{"transcript_path":"%s"}' "$TMP" | node "$HOOK" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== journal-check: фиксация = журнал =="
check "работа + журнал, без TODO → НЕ флаг"        0 "[$(tu Write 'scripts/x.sh'),$(tu Edit 'ЖУРНАЛ.html')]"
check "работа, ничего не записано → флаг"          2 "[$(tu Write 'scripts/x.sh')]"
check "работа + журнал + TODO → НЕ флаг"           0 "[$(tu Write 'scripts/x.sh'),$(tu Edit 'ЖУРНАЛ.html'),$(tu Edit 'TODO.md')]"
check "только .claude (housekeeping) → НЕ флаг"    0 "[$(tu Edit '.claude/hooks/x.js')]"
check "работа + TODO без журнала → флаг (Прав.10)" 2 "[$(tu Write 'scripts/x.sh'),$(tu Edit 'TODO.md')]"
check "правка мокапа (Мокапы/) → НЕ флаг (throwaway)" 0 "[$(tu Write 'Мокапы/hero.html')]"
check "мокап + прод-код → флаг (прод требует журнал)" 2 "[$(tu Write 'Мокапы/hero.html'),$(tu Write 'src/app.js')]"

rm -f "$TMP" "$STATE"
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
