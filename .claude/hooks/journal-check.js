#!/usr/bin/env node
// Stop hook: фиксация по горячим следам.
// Если в этом ходу была реальная работа (правки кода/файлов проекта),
// но ЖУРНАЛ.html и/или TODO.md не обновлены — завершение блокируется один раз:
// допиши 1-3 строки в журнал (что + WHY) и проставь статусы, потом завершай.
// Один пинок на одно сообщение Заказчика (state-файл).

const fs = require("fs");
const path = require("path");

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
  const statePath = path.join(root, ".claude", "journal-check-state.json");
  const transcript = input.transcript_path;
  if (!transcript || !fs.existsSync(transcript)) process.exit(0);

  const journalRe = /журнал|journal/i;
  const todoRe = /todo\.md$/i;
  const housekeepingRe = /журнал|journal|передача|todo\.md$|claude\.md$|\.claude[\\\/]/i;
  // throwaway/разведка (мокапы, прототипы) — НЕ требуют журнала: WHY фиксируется на РЕШЕНИИ, не на каждом наброске
  const throwawayRe = /мокап|mockup|прототип|prototype|scratch|sandbox/i;

  const lines = fs.readFileSync(transcript, "utf8").split("\n");
  let lastUserIdx = -1;
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch (err) {
      continue;
    }
    entries.push([i, e]);
    const c = e && e.message ? e.message.content : null;
    if (e.type === "user" && c) {
      const isReal =
        typeof c === "string" ||
        (Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result"));
      if (isReal) lastUserIdx = i;
    }
  }
  if (lastUserIdx < 0) process.exit(0);

  let workDone = false, journaled = false, todoUpdated = false;
  for (const [i, e] of entries) {
    if (i <= lastUserIdx) continue;
    const content = e && e.message && Array.isArray(e.message.content) ? e.message.content : [];
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      if (!/^(Edit|Write|MultiEdit)$/.test(String(b.name || ""))) continue;
      const file = String((b.input && (b.input.file_path || b.input.path)) || "");
      if (journalRe.test(file)) journaled = true;
      else if (todoRe.test(file)) todoUpdated = true;
      else if (!housekeepingRe.test(file) && !throwawayRe.test(file)) workDone = true;
    }
  }

  // Фиксация = запись в ЖУРНАЛ (ключевой артефакт WHY). TODO-статус жёстко не требуем
  // (очередь держит todo-drain). Иначе работа без TODO-задачи (скрипты, мета) даёт ложный пинок.
  if (!workDone || journaled) process.exit(0);

  // Один пинок на сообщение Заказчика
  let state = { lastUserIdx: -1 };
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (e) {}
  if (state.lastUserIdx === lastUserIdx) process.exit(0);
  try {
    fs.writeFileSync(statePath, JSON.stringify({ lastUserIdx }));
  } catch (e) {}

  const missing = [];
  if (!todoUpdated) missing.push("проставь статусы в TODO.md ([x]/[~]/[?])");
  if (!journaled) missing.push("допиши в ЖУРНАЛ 1–3 строки: что сделано и ПОЧЕМУ так (root cause / обоснование)");

  process.stderr.write(
    "STOP-ХУК (фиксация): в этом ходу была работа по коду, но не зафиксирована. Перед завершением: " +
      missing.join("; ") +
      ". Пиши по горячим следам — в конце сессии WHY уже выветрится. Если правки были тривиальными (опечатка и т.п.) — достаточно строки в журнале."
  );
  process.exit(2);
});
