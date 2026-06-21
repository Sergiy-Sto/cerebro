#!/usr/bin/env bash
# Тест anti-push-question.js: ловит «коммитить/пушить или нет?» при несинхронизированной
# работе. unsynced симулируется через ANTIPUSH_FAKE_UNSYNCED=1/0. Запуск: bash scripts/test-anti-push.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/anti-push-question.js"
TMP="_tp.jsonl"
pass=0; fail=0

user_block() { printf '{"type":"user","message":{"content":[{"type":"text","text":"ok"}]}}'; }
asst() { printf '{"type":"assistant","message":{"content":[{"type":"text","text":"%s"}]}}' "$1"; }
run() { # $1 = fake unsynced (1/0)
  rm -f .claude/push-nudge-state.json
  printf '{"transcript_path":"%s","stop_hook_active":false}' "$TMP" | ANTIPUSH_FAKE_UNSYNCED="$1" node "$HOOK" >/dev/null 2>&1
  echo $?
}
check() { # $1 desc, $2 expected, $3 unsynced, $4 assistant-block
  { user_block; printf '\n'; printf '%s' "$4"; } > "$TMP"
  local got; got=$(run "$3")
  if [ "$got" = "$2" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$2 факт=$got"; fail=$((fail+1)); fi
}

echo "== anti-push-question (commit+push) =="
check "спросил про push + unsynced → блок"   2 1 "$(asst 'Готово. Запушить или оставить?')"
check "спросил про commit + unsynced → блок"  2 1 "$(asst 'Всё проверено, но я не коммитил — по твоему слову. Коммитить?')"
check "спросил + всё синхронизировано → ок"   0 0 "$(asst 'Готово. Запушить или оставить?')"
check "не спросил + unsynced → ок"            0 1 "$(asst 'Закоммитил и запушил, дерево чистое.')"
check "нет commit/push + unsynced → ок"       0 1 "$(asst 'Готово, что дальше?')"

rm -f "$TMP" .claude/push-nudge-state.json
echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
