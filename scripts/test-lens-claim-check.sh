#!/usr/bin/env bash
# Тест Stop-хука lens-claim-check.js: энфорс линз по claim'у (маркер «🔎 Линзы: …»),
# гейт по браузер-активности (анти-«подумай»), артефакт-проверка per-линза.
# Запуск: bash scripts/test-lens-claim-check.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/lens-claim-check.js"
TMP="_tl.jsonl"
pass=0; fail=0

user_block() { printf '{"type":"user","message":{"content":[{"type":"text","text":"проверь"}]}}'; }
txt()      { printf '{"message":{"content":[{"type":"text","text":"%s"}]}}' "$1"; }
ss()       { printf '{"message":{"content":[{"type":"tool_use","name":"mcp__Claude_in_Chrome__computer","input":{"action":"screenshot"}}]}}'; }
critique() { printf '{"message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"design:design-critique"}}]}}'; }
click()    { printf '{"message":{"content":[{"type":"tool_use","name":"mcp__Claude_in_Chrome__computer","input":{"action":"left_click","coordinate":[10,10]}}]}}'; }
resize()   { printf '{"message":{"content":[{"type":"tool_use","name":"mcp__playwright__browser_resize","input":{"width":%s,"height":844}}]}}' "$1"; }
run() { printf '{"transcript_path":"%s","stop_hook_active":false}' "$TMP" | node "$HOOK" >/dev/null 2>&1; echo $?; }
assert() { local got; got=$(run); if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1)); else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi; }

echo "== lens-claim-check: энфорс линз по claim'у =="

{ user_block; printf '\n'; ss; printf '\n'; txt '🔎 Линзы: Дизайнер. Всё ок.'; } > "$TMP"
assert "заявил Дизайнер + браузер, critique НЕ вызван → блок" 2

{ user_block; printf '\n'; ss; printf '\n'; critique; printf '\n'; txt '🔎 Линзы: Дизайнер. Прогнал critique.'; } > "$TMP"
assert "заявил Дизайнер + critique вызван → не блок" 0

{ user_block; printf '\n'; click; printf '\n'; txt '🔎 Линзы: Пользователь. Прошёл сценарий.'; } > "$TMP"
assert "заявил Пользователь + реальный клик → не блок" 0

{ user_block; printf '\n'; ss; printf '\n'; txt '🔎 Линзы: Пользователь. Удобно.'; } > "$TMP"
assert "заявил Пользователь + только скрин (нет клика) → блок" 2

{ user_block; printf '\n'; txt '🔎 Линзы: Дизайнер — вот как это работает (обсуждение).'; } > "$TMP"
assert "заявил Дизайнер БЕЗ браузер-активности (обсуждение) → не блок [анти-подумай]" 0

{ user_block; printf '\n'; ss; printf '\n'; txt 'Проверил как дизайнер, всё ок.'; } > "$TMP"
assert "вольный текст без маркера «Линзы:» → не блок (ловим claim, не слова)" 0

{ user_block; printf '\n'; ss; printf '\n'; txt '🔎 Линзы: Ревьюер. Багов нет.'; } > "$TMP"
assert "заявил Ревьюер (без артефакта) → не блок (не энфорсим)" 0

{ user_block; printf '\n'; resize 390; printf '\n'; txt '🔎 Линзы: Моб. Не ломается.'; } > "$TMP"
assert "заявил Моб + resize 390 → не блок" 0

{ user_block; printf '\n'; ss; printf '\n'; txt '🔎 Линзы: Моб. Ок на телефоне.'; } > "$TMP"
assert "заявил Моб + браузер, но без resize ≤500 → блок" 2

{ user_block; printf '\n'; ss; printf '\n'; critique; printf '\n'; click; printf '\n'; txt '🔎 Линзы: Дизайнер + Пользователь. Готово.'; } > "$TMP"
assert "мульти: Дизайнер+Пользователь, оба артефакта есть → не блок" 0

{ user_block; printf '\n'; ss; printf '\n'; critique; printf '\n'; txt '🔎 Линзы: Дизайнер + Пользователь. Готово.'; } > "$TMP"
assert "мульти: Дизайнер ок, но Пользователь без кликов → блок" 2

rm -f "$TMP"
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
