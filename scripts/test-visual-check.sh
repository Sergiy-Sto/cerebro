#!/usr/bin/env bash
# Тест Stop-хука visual-check.js: проверяет whitelist локальных доков
# и что реальная вёрстка по-прежнему флагается.
# Запуск одной чистой командой (без inline-скобок → без промпта obfuscation):
#   bash scripts/test-visual-check.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/visual-check.js"
TMP="_t.jsonl"
pass=0; fail=0

edit_block() { printf '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"%s","new_string":"%s"}}]}}' "$1" "$2"; }
ss_block()   { printf '{"message":{"content":[{"type":"tool_use","name":"mcp__Claude_in_Chrome__computer","input":{"action":"screenshot"}}]}}'; }
run() { printf '{"transcript_path":"%s","stop_hook_active":false}' "$TMP" | node "$HOOK" >/dev/null 2>&1; echo $?; }

# $1 = описание, $2 = ожидаемый код (0=не флаг, 2=флаг), $3 = содержимое транскрипта
check() {
  printf '%s' "$3" > "$TMP"
  local got; got=$(run)
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== visual-check: whitelist + защита прода =="
check "ЖУРНАЛ.html (док)"      0 "$(edit_block 'C:/x/ЖУРНАЛ.html' 'body{color:red;margin:0} class=card')"
check "ПРОЕКТ.md (док)"        0 "$(edit_block 'ПРОЕКТ.md' 'arch color margin')"
check "style.css (вёрстка)"    2 "$(edit_block 'assets/style.css' 'body{color:red}')"
check "product-page.html"      2 "$(edit_block 'product-page.html' 'div class= margin padding color flex')"
check ".claude/hooks (тулинг)" 0 "$(edit_block '.claude/hooks/visual-check.js' 'color margin padding flex grid styleMarkerRe')"
{ edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_block; } > "$TMP"
check "css + скриншот после"   0 "$(cat "$TMP")"

rm -f "$TMP"
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
