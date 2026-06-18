#!/usr/bin/env bash
# Тест anti-push-question.js: ловит «пушить или нет?» при незапушенных коммитах.
# ahead симулируется через ANTIPUSH_FAKE_AHEAD. Запуск: bash scripts/test-anti-push.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/anti-push-question.js"
TMP="_tp.jsonl"
pass=0; fail=0

user_block() { printf '{"type":"user","message":{"content":[{"type":"text","text":"ok"}]}}'; }
asst() { printf '{"type":"assistant","message":{"content":[{"type":"text","text":"%s"}]}}' "$1"; }
run() { # $1 = fake ahead
  rm -f .claude/push-nudge-state.json
  printf '{"transcript_path":"%s","stop_hook_active":false}' "$TMP" | ANTIPUSH_FAKE_AHEAD="$1" node "$HOOK" >/dev/null 2>&1
  echo $?
}
check() { # $1 desc, $2 expected, $3 ahead, $4 assistant-block
  { user_block; printf '\n'; printf '%s' "$4"; } > "$TMP"
  local got; got=$(run "$3")
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== anti-push-question =="
check "спросил + ahead=2 → блок"   2 2 "$(asst 'Готово. Запушить или оставить?')"
check "спросил + ahead=0 → ок"     0 0 "$(asst 'Готово. Запушить или оставить?')"
check "не спросил + ahead=2 → ок"  0 2 "$(asst 'Запушил, дерево чистое.')"
check "нет пуша + ahead=2 → ок"    0 2 "$(asst 'Готово, что дальше?')"

rm -f "$TMP" .claude/push-nudge-state.json
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
