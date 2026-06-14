#!/usr/bin/env node
// Stop hook (v2, объединённая): "готово без скриншота = нарушение".
// Покрывает ДВА воркфлоу: файловый (Edit/Write .css/.jsx/.php) и браузерный
// (живой WordPress/Elementor через Chrome MCP: $e.run, WPCode setValue,
// wp.data.dispatch-сеттеры, savePost, fetch POST, сабмиты).
// Скриншотом считается ТОЛЬКО реальный screenshot/zoom через Chrome MCP.
// DOM-чтение (page_text, computed style) НЕ считается — оно и усыпляет бдительность.
// Один пинок за ход (stop_hook_active).
// Адаптация: Claude (сессия ScandiWall) по полевому опыту; фикс browser_batch: Claude (ревью).

const fs = require("fs");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch (e) { process.exit(0); }
  if (input.stop_hook_active) process.exit(0);
  const path = input.transcript_path;
  if (!path || !fs.existsSync(path)) process.exit(0);

  const jsMutationRe = new RegExp(
    [
      "\\$e\\.run\\(['\"]document\\/(elements|save)",
      "\\.setValue\\(",
      "wp\\.data\\.dispatch\\([^)]*\\)\\.(update|edit|save|insert|remove)",
      "savePost|saveEditedEntityRecord",
      "max-mega-menu-save|custom-html-widget-save|save_grid_data",
      "method\\s*:\\s*['\"]POST['\"]",
      "\\.submit\\(\\)|button-primary|input\\[type=.submit",
    ].join("|"),
    "i"
  );
  const screenshotInBatchRe = /"action"\s*:\s*"(screenshot|zoom)"|save_to_disk"\s*:\s*true/i;
  const fileVisualRe = /\.(css|scss|sass|less)$/i;
  const fileMarkupRe = /\.(jsx?|tsx?|vue|html|php)$/i;
  const styleMarkerRe = /className|class=|style=|tailwind|font-|color|margin|padding|flex|grid|elementor|mega-menu/i;
  // Локальные доки проекта (журнал/проект/очередь/правила) и файлы тулинга в
  // .claude/ — НЕ вёрстка сайта. ЖУРНАЛ.html содержит CSS, а сами хуки (.js)
  // содержат слова color/margin/... в регэкспах → оба ловятся styleMarkerRe.
  const docExemptRe = /(^|[\\/])(ЖУРНАЛ\.html|ПРОЕКТ\.md|TODO\.md|CLAUDE\.md)$|(^|[\\/])\.claude[\\/]/i;

  // ФИКС false-positive: считаем мутации/скрины ТОЛЬКО в текущем ходу
  // (от последнего реального сообщения Заказчика и далее). Иначе старые
  // .tsx/.css-Edit'ы из ранних сессий висят как «непрокрытая мутация», и
  // хук пинает каждый ход, даже когда правок в текущем ходу не было.
  const allLines = fs.readFileSync(path, "utf8").split("\n");
  let lastUserIdx = -1;
  for (let k = 0; k < allLines.length; k++) {
    if (!allLines[k].trim()) continue;
    let e;
    try { e = JSON.parse(allLines[k]); } catch (err) { continue; }
    const c = e && e.message ? e.message.content : null;
    if (e.type === "user" && c) {
      const isReal =
        typeof c === "string" ||
        (Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result"));
      if (isReal) lastUserIdx = k;
    }
  }
  if (lastUserIdx < 0) process.exit(0);

  let lastMutation = -1;
  let lastScreenshot = -1;
  let i = 0;

  for (const line of allLines) {
    i++;
    if (i <= lastUserIdx + 1) continue; // считаем только после последнего user-сообщения
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch (e) { continue; }
    const content = entry && entry.message && Array.isArray(entry.message.content) ? entry.message.content : [];
    for (const block of content) {
      if (!block || block.type !== "tool_use") continue;
      const name = String(block.name || "");
      const inp = block.input || {};

      if (/Claude_in_Chrome/.test(name)) {
        if (/javascript_tool/.test(name) && jsMutationRe.test(String(inp.text || ""))) lastMutation = i;
        else if (/browser_batch/.test(name)) {
          const ser = JSON.stringify(inp);
          if (jsMutationRe.test(ser)) lastMutation = i;
          if (screenshotInBatchRe.test(ser)) lastScreenshot = Math.max(lastScreenshot, i); // ФИКС: скрин внутри batch
        }
        if (/computer/.test(name) && /screenshot|zoom/i.test(String(inp.action || ""))) lastScreenshot = i;
        else if (/screenshot/i.test(name)) lastScreenshot = i;
        else if (inp.save_to_disk === true) lastScreenshot = i;
      }

      if (/^(Edit|Write|MultiEdit)$/.test(name)) {
        const file = String(inp.file_path || inp.path || "");
        const text = String(inp.new_string || inp.content || "");
        if (docExemptRe.test(file)) continue; // локальный док проекта — не страница сайта
        if (fileVisualRe.test(file) || (fileMarkupRe.test(file) && styleMarkerRe.test(text))) lastMutation = i;
      }
    }
  }

  if (lastMutation > -1 && lastScreenshot < lastMutation) {
    process.stderr.write(
      "STOP-ХУК (визуал): была правка живой страницы (Elementor/WPCode/Rank Math/POST) или визуального файла, " +
      "но ПОСЛЕ неё нет скриншота через Chrome MCP. Правило 2: сними скрин затронутого блока (desktop; mobile если " +
      "задет responsive), сравни ДО/ПОСЛЕ или с эталоном, и только потом завершай с явным «проверил визуально». " +
      "DOM-проверка (page_text/computed style) НЕ считается. " +
      "Скрин физически не снимается — напиши это ЯВНО и попроси Заказчика глянуть у себя."
    );
    process.exit(2);
  }
  process.exit(0);
});
