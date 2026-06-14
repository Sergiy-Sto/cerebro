#!/usr/bin/env node
// Stop hook: дренаж TODO.md (Ralph-лайт).
// Claude завершает ход, а в секции "## Сейчас" файла TODO.md остались задачи [ ] →
// завершение блокируется: бери следующую задачу и работай.
//
// Предохранители:
//  - ❓ в последнем тексте Клода (настоящий вопрос к Заказчику) → выпускаем
//  - максимум MAX_AUTO задач подряд на одно сообщение Заказчика → выпускаем
//  - задачи [~] (в работе) и [?] (заблокированы) не триггерят
//  - нет TODO.md → молчим

const fs = require("fs");
const path = require("path");

const MAX_AUTO = 5; // сколько задач подряд можно дренировать без участия Заказчика

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    process.exit(0);
  }

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const todoPath = path.join(root, "TODO.md");
  const statePath = path.join(root, ".claude", "todo-drain-state.json");
  const transcript = input.transcript_path;
  if (!fs.existsSync(todoPath) || !transcript || !fs.existsSync(transcript)) process.exit(0);

  // --- 1. Считаем невзятые задачи в секции "Сейчас"
  const todo = fs.readFileSync(todoPath, "utf8");
  const m = todo.match(/##\s*Сейчас([\s\S]*?)(\n##\s|$)/);
  const section = m ? m[1] : "";
  const openTasks = (section.match(/^\s*-\s*\[ \]/gm) || []).length;
  if (openTasks === 0) process.exit(0);

  // --- 2. Разбираем транскрипт: индекс последнего сообщения Заказчика и последний текст Клода
  const lines = fs.readFileSync(transcript, "utf8").split("\n");
  let lastUserIdx = -1;
  let lastAssistantText = "";
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch (err) {
      continue;
    }
    const c = e && e.message ? e.message.content : null;
    if (e.type === "user" && c) {
      const isReal =
        typeof c === "string" ||
        (Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result"));
      if (isReal) lastUserIdx = i;
    }
    if (e.type === "assistant" && Array.isArray(c)) {
      for (const b of c) if (b.type === "text" && b.text) lastAssistantText = String(b.text);
    }
  }

  // --- 3. Аварийный выход: Claude задал настоящий вопрос (маркер ❓) или явно ждёт Заказчика
  if (/❓|⏸/.test(lastAssistantText)) process.exit(0);

  // --- 4. Лимит автозадач на одно сообщение Заказчика
  let state = { lastUserIdx: -1, count: 0 };
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (e) {}
  if (state.lastUserIdx !== lastUserIdx) state = { lastUserIdx, count: 0 };
  if (state.count >= MAX_AUTO) process.exit(0);
  state.count++;
  try {
    fs.writeFileSync(statePath, JSON.stringify(state));
  } catch (e) {}

  process.stderr.write(
    "STOP-ХУК (дренаж TODO): в секции «Сейчас» осталось задач: " + openTasks +
      " (автоцикл " + state.count + "/" + MAX_AUTO + "). Правило: закрыл задачу → бери следующую, не спрашивая «что дальше». " +
      "Действуй: 1) отчитайся ✅ по сделанному (коротко); 2) возьми ВЕРХНЮЮ [ ] из «Сейчас», пометь [~]; 3) выполни по правилам CLAUDE.md, по готовности пометь [x] и допиши 1–2 строки в ЖУРНАЛ (что+WHY). " +
      "Останавливаться можно только если: есть настоящий продуктовый вопрос к Заказчику (задай его с маркером ❓, задачу пометь [?] и перенеси в «Заблокировано») или очередь пуста."
  );
  process.exit(2);
});
