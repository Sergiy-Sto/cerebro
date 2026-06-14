#!/usr/bin/env node
// Stop hook: анти-капитуляция. Механическая версия мета-правила инвентаря.
// Если Claude завершает ход, заявляя ограничение или прося Заказчика сделать что-то
// (паттерны "не могу", "невозможно", маркер 👉 и т.п.), но при этом в этом ходу
// НЕ делал веб-поиск решения — завершение блокируется с требованием сначала поискать.
// Один "пинок" за ход (stop_hook_active защищает от цикла).

const fs = require("fs");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    process.exit(0);
  }
  if (input.stop_hook_active) process.exit(0);

  const path = input.transcript_path;
  if (!path || !fs.existsSync(path)) process.exit(0);

  // Паттерны капитуляции / переброса на Заказчика
  const capitulationRe =
    /не могу|невозможно|не получится|нет (такого )?(инструмента|доступа|возможности)|не позволяет|нерешаем|сделай (сам|скрин)|проверь (сам|у себя)|попрошу тебя|тебе нужно (сделать|проверить)/i;
  // Что считаем "поиском решения" (вкл. исследование субагентом — Agent/Task)
  const searchToolRe = /websearch|webfetch|web_search|tool_?search|search_mcp|^agent$|^task$/i;
  // Легитимная продуктовая передача мяча — НЕ капитуляция (фидбек с полей)
  const productHandoffRe = /выбери|какой (из )?вариант|вариант[ы]? (заголовк|названи|дизайн|текст)|что предпочитаешь|какой тебе (больше )?нрав|утверди|согласуй/i;

  const lines = fs.readFileSync(path, "utf8").split("\n");

  // Найти индекс последнего НАСТОЯЩЕГО сообщения Заказчика (не tool_result)
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
    if (e.type === "user" && e.message) {
      const c = e.message.content;
      const isReal =
        typeof c === "string" ||
        (Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result"));
      if (isReal) lastUserIdx = i;
    }
  }
  if (lastUserIdx < 0) process.exit(0);

  // Сканируем текущий ход (всё после последнего сообщения Заказчика)
  let capitulated = false;
  let searched = false;
  let lastText = "";
  for (const [i, e] of entries) {
    if (i <= lastUserIdx) continue;
    const content = e && e.message && Array.isArray(e.message.content) ? e.message.content : [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        lastText = String(block.text);
        if (capitulationRe.test(lastText)) capitulated = true;
      }
      if (block.type === "tool_use" && searchToolRe.test(String(block.name || ""))) searched = true;
    }
  }

  if (capitulated && !searched && !productHandoffRe.test(lastText)) {
    process.stderr.write(
      "STOP-ХУК (анти-капитуляция): в ответе заявлено ограничение или просьба к Заказчику, но поиска решения в этом ходу не было. " +
        "Если это ПРОДУКТОВЫЙ вопрос (видение, выбор варианта) — завершай как есть. " +
        "Если ТЕХНИЧЕСКИЙ — сначала выполни мета-правило инвентаря: веб-поиск 'how to X' / 'X MCP' / npm-пакет, попробуй обходной путь. " +
        "После поиска либо реши задачу сам, либо вернись с обоснованным ответом: что попробовал, какие варианты существуют, что предлагаешь."
    );
    process.exit(2);
  }
  process.exit(0);
});
