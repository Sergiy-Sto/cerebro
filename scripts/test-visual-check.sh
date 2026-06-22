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

user_block() { printf '{"type":"user","message":{"content":[{"type":"text","text":"test"}]}}'; }
edit_block() { printf '{"message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"%s","new_string":"%s"}}]}}' "$1" "$2"; }
ss_block()   { printf '{"message":{"content":[{"type":"tool_use","name":"mcp__Claude_in_Chrome__computer","input":{"action":"screenshot"}}]}}'; }
done_block() { printf '{"message":{"content":[{"type":"text","text":"готово ✅"}]}}'; }
mobshot_block() { printf '{"message":{"content":[{"type":"tool_use","name":"mcp__playwright__browser_resize","input":{"width":390,"height":844}}]}}'; }
ss_id()   { printf '{"message":{"content":[{"type":"tool_use","id":"%s","name":"mcp__Claude_in_Chrome__computer","input":{"action":"screenshot"}}]}}' "$1"; }
res_err() { printf '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"%s","is_error":true,"content":"Error capturing screenshot: CDP timed out"}]}}' "$1"; }
res_ok()  { printf '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"%s","content":"Successfully captured screenshot"}]}}' "$1"; }
claim()   { printf '{"message":{"content":[{"type":"text","text":"%s"}]}}' "$1"; }
run() { rm -f .claude/visual-check-mobile-state.json; printf '{"transcript_path":"%s","stop_hook_active":false}' "$TMP" | node "$HOOK" >/dev/null 2>&1; echo $?; }

# $1 = описание, $2 = ожидаемый код (0=не флаг, 2=флаг), $3 = блоки ПОСЛЕ user-сообщения
check() {
  { user_block; printf '\n'; printf '%s' "$3"; } > "$TMP"
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
{ user_block; printf '\n'; edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_block; } > "$TMP"
check_after_compose() {
  local got; got=$(run)
  if [ "$got" = "0" ]; then echo "  OK  [css + скриншот после] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[css + скриншот после] ожид=0 факт=$got"; fail=$((fail+1)); fi
}
check_after_compose
# доп. кейс: только user-сообщение без действий → не флаг
{ user_block; } > "$TMP"
got=$(run)
if [ "$got" = "0" ]; then echo "  OK  [пустой ход (нет правок)] exit=$got"; pass=$((pass+1));
else echo "  FAIL[пустой ход] ожид=0 факт=$got"; fail=$((fail+1)); fi
# доп. кейс: старая мутация ДО user-сообщения не должна флагать в новом ходу
{ edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; user_block; } > "$TMP"
got=$(run)
if [ "$got" = "0" ]; then echo "  OK  [старая мутация до user → не флаг (фикс)] exit=$got"; pass=$((pass+1));
else echo "  FAIL[старая мутация до user] ожид=0 факт=$got"; fail=$((fail+1)); fi

# --- Mobile-нудж на завершении ---
echo "== visual-check: mobile-нудж =="
massert() { local got; got=$(run); if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1)); else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi; }
{ user_block; printf '\n'; edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_block; printf '\n'; done_block; } > "$TMP"
massert "вёрстка+готово+десктоп-скрин, без моб → нудж" 2
{ user_block; printf '\n'; edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_block; printf '\n'; mobshot_block; printf '\n'; done_block; } > "$TMP"
massert "вёрстка+готово+моб-скрин снят → не нудж" 0
{ user_block; printf '\n'; edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_block; } > "$TMP"
massert "вёрстка без завершения → не нудж" 0
{ user_block; printf '\n'; done_block; } > "$TMP"
massert "завершение без вёрстки → не нудж" 0

echo "== visual-check: упавший скрин не засчитывается =="
{ user_block; printf '\n'; edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_id 's1'; printf '\n'; res_err 's1'; } > "$TMP"
massert "css + упавший скрин (timeout) → флаг" 2
{ user_block; printf '\n'; edit_block 'assets/style.css' 'body{color:red}'; printf '\n'; ss_id 's2'; printf '\n'; res_ok 's2'; } > "$TMP"
massert "css + успешный скрин (с id) → не флаг" 0

echo "== visual-check: визуал-claim нудж =="
{ user_block; printf '\n'; claim 'Создал страницу Аксессуары, готово.'; } > "$TMP"
massert "создал страницу + готово, без скрина → нудж" 2
{ user_block; printf '\n'; claim 'Создал страницу Аксессуары, готово.'; printf '\n'; ss_block; } > "$TMP"
massert "создал страницу + скрин снят → не нудж" 0
{ user_block; printf '\n'; claim 'Готово, обновил TODO.'; } > "$TMP"
massert "готово без визуала → не нудж" 0

rm -f "$TMP" .claude/visual-check-mobile-state.json
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
