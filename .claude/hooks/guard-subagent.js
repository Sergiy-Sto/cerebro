#!/usr/bin/env node
// PreToolUse hook (matcher: Agent|Task): дисциплина делегирования субагенту.
// Если в задаче субагенту нет признаков shell-дисциплины (файл-тулы / явная инструкция),
// блокируем (exit 2) с напоминанием — чтобы его команды не порождали permission-промпты у Заказчика.
// Механическая версия Правила 14 (мягкое правило → хук, который напомнит в нужный момент).

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
