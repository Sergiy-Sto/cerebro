#!/usr/bin/env node
// Stop hook: анти-«пушить или нет?». Правило 9 — push в master разрешения НЕ требует.
// Если в последнем сообщении Claude спрашивает/откладывает пуш, а в репо есть
// незапушенные коммиты → блок: пушь сам (или назови реальную причину не пушить).
// Один раз на сообщение Заказчика (state-файл). Тест-сим ahead: ANTIPUSH_FAKE_AHEAD.

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

  // Claude упоминает пуш И спрашивает/откладывает?
  const mentionsPush = /пуш|push/i.test(lastAssistantText);
  const asksOrDefers = /\?/.test(lastAssistantText) ||
    /\bили\b\s*(остав|нет|подожд|копить|позже|не\s*пуш)|оставить\s+как\s+есть|пока\s+(не\s+пуш|оставим)/i.test(lastAssistantText);
  if (!(mentionsPush && asksOrDefers)) process.exit(0);

  // есть незапушенные коммиты? (тест-сим через ANTIPUSH_FAKE_AHEAD)
  let ahead = 0;
  if (process.env.ANTIPUSH_FAKE_AHEAD != null) {
    ahead = parseInt(process.env.ANTIPUSH_FAKE_AHEAD, 10) || 0;
  } else {
    try {
      ahead = parseInt(cp.execSync("git rev-list --count @{u}..HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), 10) || 0;
    } catch (e) { process.exit(0); } // нет upstream / не git-репо → молчим
  }
  if (ahead === 0) process.exit(0);

  // один раз на сообщение Заказчика
  const statePath = path.join(root, ".claude", "push-nudge-state.json");
  let st = { lastUserIdx: -1 };
  try { st = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) {}
  if (st.lastUserIdx === lastUserIdx) process.exit(0);
  try { fs.writeFileSync(statePath, JSON.stringify({ lastUserIdx })); } catch (e) {}

  process.stderr.write(
    "STOP-ХУК (анти-пуш-вопрос): ты спрашиваешь/откладываешь пуш, а в репо " + ahead + " незапушенных коммит(ов). " +
    "Правило 9: push в master разрешения НЕ требует — НЕ спрашивай, запушь сам (git push). " +
    "Реальная причина не пушить (работа сырая / force-push / Заказчик просил подождать) → назови её ЯВНО, иначе push."
  );
  process.exit(2);
});
