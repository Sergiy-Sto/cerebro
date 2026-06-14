#!/usr/bin/env bash
# Тест UserPromptSubmit-хука think-deeper.js: кодовое слово → впрыскивает гейт, иначе тихо.
# Запуск: bash scripts/test-think-deeper.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/think-deeper.js"
pass=0; fail=0

# $1 описание, $2 ожидание (yes=впрыск / no=тихо), $3 JSON-инпут
check() {
  local out; out=$(printf '%s' "$3" | node "$HOOK" 2>/dev/null)
  local has=no; [ -n "$out" ] && has=yes
  if [ "$has" = "$2" ]; then echo "  OK  [$1] inject=$has"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$has"; fail=$((fail+1)); fi
}

echo "== think-deeper: кодовое слово =="
check "«подумай» → гейт"          yes '{"prompt":"подумай над структурой кэша"}'
check "«обдумай» → гейт"          yes '{"prompt":"обдумай это решение"}'
check "«а если подумать» → гейт"  yes '{"prompt":"а если подумать, как лучше?"}'
check "обычный вопрос → тихо"     no  '{"prompt":"как дела со сборкой кита?"}'

echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
