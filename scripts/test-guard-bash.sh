#!/usr/bin/env bash
# Тест guard-bash.js: блок опасных команд. Compound (&&/;) РАЗРЕШЁН (под Bypass промпта нет).
# Запуск: bash scripts/test-guard-bash.sh
set -u
cd "$(dirname "$0")/.." || exit 1
HOOK=".claude/hooks/guard-bash.js"
pass=0; fail=0

# $1 описание, $2 JSON-значение команды, $3 ожидаемый код (0=ок, 2=блок)
check() {
  printf '{"tool_input":{"command":%s}}' "$2" | node "$HOOK" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$3" ]; then echo "  OK  [$1] exit=$got"; pass=$((pass+1));
  else echo "  FAIL[$1] ожид=$3 факт=$got"; fail=$((fail+1)); fi
}

echo "== guard-bash: опасное блок / compound разрешён =="
check "rm -rf (блок)"             '"rm -rf /tmp/x"'           2
check "git push --force (блок)"   '"git push --force origin"' 2
check "rm -rf внутри && (блок)"   '"echo a && rm -rf /tmp/x"' 2
check "&& цепочка (ОК)"           '"mkdir a && cd a"'         0
check "; цепочка (ОК)"            '"python a.py; python b.py"' 0
check "shell-функция (ОК)"        '"f() { echo hi; }"'        0
check "простая команда (ок)"      '"python scripts/build-kit.py"' 0
check "pipe grep|head (ок)"       '"grep x file | head"'      0
check "git -C (ок)"               '"git -C /p status"'        0

echo "Итог: PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
