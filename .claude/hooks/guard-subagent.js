#!/usr/bin/env node
// PreToolUse hook (matcher: Agent|Task) — РЕТАЙРНУТ 2026-06-15 (no-op).
// Цель (не давать subagent-командам порождать permission-промпты) снята Bypass-режимом
// + релаксацией guard-bash. Оставлен как no-op для лёгкого возврата: убери строку exit ниже.
process.exit(0);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    process.exit(0); // не распарсили — не мешаем
  }
  const tool = String(input.tool_name || "");
  if (!/^(Agent|Task)$/i.test(tool)) process.exit(0);

  const payload = JSON.stringify(input.tool_input || {});
  // Признаки, что дисциплина учтена: упомянуты файл-инструменты или явная инструкция по shell.
  const disciplineRe = /Glob|Read|Grep|diff|без\s*`?&&|прост\w+\s+команд|shell[ -]?дисциплин|файл-?тул/i;
  if (disciplineRe.test(payload)) process.exit(0);

  process.stderr.write(
    "PreToolUse (субагент): в задаче субагенту нет дисциплины shell. " +
      "Допиши в его prompt: «простые команды или Glob/Read/Grep/diff, без `&&`-цепочек и обёрток в путях» — " +
      "иначе его команды дадут permission-промпты Заказчику (Правило 14). Добавь и повтори вызов."
  );
  process.exit(2);
});
