#!/usr/bin/env node
// Stop hook: анти-«коммитить/пушить или нет?». Правило 9 — commit+push проверенной
// работы делается САМ, без спроса. Если в последнем сообщении Claude спрашивает/
// откладывает commit ИЛИ push, а в репо есть несинхронизированная работа
// (незакоммиченные правки ИЛИ незапушенные коммиты) → блок: делай сам / назови причину.
// Один раз на сообщение Заказчика (state-файл). Тест-сим: ANTIPUSH_FAKE_UNSYNCED=1/0.

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch (e) { process.exit(0); }
  if (input.stop_hook_active) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const transcript = input.transcript_path;
  if (!transcript || !fs.existsSync(transcript)) process.exit(0);

  const lines = fs.readFileSync(transcript, "utf8").split("\n");
  let lastUserIdx = -1, lastAssistantText = "";
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let e; try { e = JSON.parse(lines[i]); } catch (err) { continue; }
    const c = e && e.message ? e.message.content : null;
    if (e.type === "user" && c) {
      const isReal = typeof c === "string" ||
        (Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result"));
      if (isReal) lastUserIdx = i;
    }
    if (e.type === "assistant" && Array.isArray(c)) {
      for (const b of c) if (b.type === "text" && b.text) lastAssistantText = String(b.text);
    }
  }
  if (lastUserIdx < 0) process.exit(0);

  // Claude упоминает commit/push И спрашивает/откладывает?
  const mentions = /коммит|commit|закоммит|пуш|push/i.test(lastAssistantText);
  const asksOrDefers = /\?/.test(lastAssistantText) ||
    /\bили\b\s*(остав|нет|подожд|копить|позже|не\s*(пуш|коммит))|оставить\s+как\s+есть|пока\s+(не\s+(пуш|коммит)|оставим)|по\s+тво(ему|ему)\s+слову/i.test(lastAssistantText);
  if (!(mentions && asksOrDefers)) process.exit(0);

  // есть несинхронизированная работа? (незакоммиченное ИЛИ незапушенное)
  let unsynced;
  if (process.env.ANTIPUSH_FAKE_UNSYNCED != null) {
    unsynced = process.env.ANTIPUSH_FAKE_UNSYNCED === "1";
  } else {
    try {
      const ahead = parseInt(cp.execSync("git rev-list --count @{u}..HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), 10) || 0;
      const dirty = cp.execSync("git status --porcelain", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().length > 0;
      unsynced = ahead > 0 || dirty;
    } catch (e) { process.exit(0); } // нет git/upstream → молчим
  }
  if (!unsynced) process.exit(0);

  // один раз на сообщение Заказчика
  const statePath = path.join(root, ".claude", "push-nudge-state.json");
  let st = { lastUserIdx: -1 };
  try { st = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) {}
  if (st.lastUserIdx === lastUserIdx) process.exit(0);
  try { fs.writeFileSync(statePath, JSON.stringify({ lastUserIdx })); } catch (e) {}

  process.stderr.write(
    "STOP-ХУК (анти-вопрос про commit/push): ты спрашиваешь/откладываешь commit или push, " +
    "а в репо есть несинхронизированная работа (незакоммиченные правки / незапушенные коммиты). " +
    "Правило 9: НЕ спрашивай — закрыл проверенную работу → commit + push сам. " +
    "Реальная причина не делать (работа сырая / force-push / Заказчик просил подождать) → назови ЯВНО."
  );
  process.exit(2);
});
