#!/usr/bin/env node
// Stop-хук: энфорс ЛИНЗ по claim'у, не по запросу Заказчика (анти-«подумай»).
// Триггер — МОЙ структурный маркер «🔎 Линзы: …» (CLAUDE.md велит его ставить),
// а не вольные слова. Заявил линзу → артефакта нет → блок.
//   🎨 Дизайнер → вызов скилла design:design-critique
//   👤 Пользователь → реальные клики/навигация в браузере
//   📱 Моб → browser_resize ≤500
//   🔍 Ревьюер → чистого артефакта нет, не энфорсим.
// Гейт от ложных: только если в ходу была реальная браузер-активность (не обсуждение).
"use strict";
const fs = require("fs");

let data;
try { data = JSON.parse(fs.readFileSync(0, "utf8")); } catch (e) { process.exit(0); }
if (data.stop_hook_active) process.exit(0); // не зацикливаемся
const tp = data.transcript_path;
if (!tp) process.exit(0);

let events = [];
try {
  events = fs.readFileSync(tp, "utf8").split("\n").filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter(Boolean);
} catch (e) { process.exit(0); }

// последнее НАСТОЯЩЕЕ сообщение Заказчика (не tool_result)
let lastUserIdx = -1;
for (let i = 0; i < events.length; i++) {
  const e = events[i];
  if (e.type === "user" && Array.isArray(e.message && e.message.content)) {
    const isToolResult = e.message.content.some(c => c.type === "tool_result");
    const hasText = e.message.content.some(c => c.type === "text");
    if (hasText && !isToolResult) lastUserIdx = i;
  } else if (e.type === "user" && typeof (e.message && e.message.content) === "string") {
    lastUserIdx = i;
  }
}

let turnText = "";
let designCriticInvoked = false, userInteracted = false, mobResized = false, browserActivity = false;
for (let i = lastUserIdx + 1; i < events.length; i++) {
  const content = events[i].message && events[i].message.content;
  if (!Array.isArray(content)) continue;
  for (const c of content) {
    if (c.type === "text") turnText += " " + c.text;
    if (c.type !== "tool_use") continue;
    const name = c.name || "";
    const inpStr = JSON.stringify(c.input || {});
    if (/Claude_in_Chrome|playwright/i.test(name)) browserActivity = true;
    if (/^(Skill|Agent|Task)$/i.test(name) && /design-critique/i.test(inpStr)) designCriticInvoked = true;
    // реальное взаимодействие как пользователь: навигация/клик/ввод/тап
    if (/Claude_in_Chrome__(navigate|form_input|find|file_upload)|playwright__browser_(click|navigate|type|fill_form|press_key|hover|select_option|drag)/i.test(name)) userInteracted = true;
    if (/Claude_in_Chrome__computer/i.test(name) && /(left_click|right_click|double_click|middle_click|\btype\b|\bkey\b|scroll|drag|click)/i.test(inpStr)) userInteracted = true;
    if (/resize/i.test(name)) {
      const inp = c.input || {};
      const w = Number(inp.width || (inp.size && inp.size.width) || 0);
      if (w > 0 && w <= 500) mobResized = true;
    }
  }
}

// Триггер: мой структурный анонс «🔎 Линзы: …» (эмодзи опционален, двоеточие обязательно).
const m = turnText.match(/(?:🔎\s*)?Линз[а-яёА-ЯЁ]*\s*:[^\n]{0,160}/i);
if (!m) process.exit(0);                 // линзы не заявлял
if (!browserActivity) process.exit(0);   // обсуждение без работы — не firing (анти-«подумай»)
const announce = m[0];

const missing = [];
if (/дизайнер/i.test(announce) && !designCriticInvoked)
  missing.push("🎨 Дизайнер — скилл design:design-critique НЕ вызван");
if (/(пользовател|юзер)/i.test(announce) && !userInteracted)
  missing.push("👤 Пользователь — не было реальных кликов/навигации в браузере (скрин/чтение DOM не считается)");
if (/(телефон|моб)/i.test(announce) && !mobResized)
  missing.push("📱 Моб — не было browser_resize ≤500");
if (!missing.length) process.exit(0);

process.stderr.write(
  "🔔 STOP-ХУК (энфорс линз, НЕ запрет): ты объявил линзы, но артефакта нет — " + missing.join("; ") + ". " +
  "Либо РЕАЛЬНО прогони (вызови скилл / покликай в браузере / сделай resize ≤500), либо убери заявление об этой линзе из ответа. " +
  "Заявить прогон без прогона = та самая отписка «ок», от которой линзы и защищают."
);
process.exit(2);
