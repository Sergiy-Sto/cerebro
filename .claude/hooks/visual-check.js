#!/usr/bin/env node
// Stop hook (v2, объединённая): "готово без скриншота = нарушение".
// Покрывает ДВА воркфлоу: файловый (Edit/Write .css/.jsx/.php) и браузерный
// (живой WordPress/Elementor через Chrome MCP: $e.run, WPCode setValue,
// wp.data.dispatch-сеттеры, savePost, fetch POST, сабмиты).
// Скриншотом считается реальный screenshot/zoom через Chrome MCP или Playwright,
// ЧЕЙ РЕЗУЛЬТАТ НЕ ОШИБКА (упавший/timeout-скрин НЕ засчитывается — проход 0).
// DOM-чтение (page_text, computed style) НЕ считается — оно и усыпляет бдительность.
// Один пинок за ход (stop_hook_active).
// + Mobile-нудж: на ЗАВЕРШЕНИИ этапа с правкой вёрстки, если моб-скрин не снят → напоминание.
// + Визуал-claim нудж: на завершении Claude УТВЕРЖДАЕТ визуальную работу (создал страницу,
//   вёрстка, отступ, "выглядит ок"), но скрина в ходу НЕТ → напоминание (ловит дыру, когда
//   страница создана через Bash/WP-CLI/клики — мутация не задетектена, но визуал заявлен).
// Адаптация: Claude (сессия ScandiWall) по полевому опыту.

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
  const docExemptRe = /(^|[\\/])(ЖУРНАЛ\.html|ПРОЕКТ\.md|TODO\.md|CLAUDE\.md)$|(^|[\\/])\.claude[\\/]/i;

  // --- Нуджи на финише ---
  const completionTextRe = /готов|сделан|задача выполн|этап выполн|✅/i;
  const gitCommitRe = /git\s+(-C\s+\S+\s+)?commit/i;
  const playwrightShotRe = /playwright__browser_take_screenshot/i;
  // Утверждение визуальной работы (создал страницу / вёрстка / визуальный вывод)
  const visualClaimRe = /(создал|сделал|сверстал|собрал|оформил|свёрстан|добавил|поправил|подвинул)\w*\s*(страниц|секци|блок|меню|хедер|футер|шапк|подвал|карточк|кнопк|попап|модал|лендинг|форм|вёрстк)|вёрстк\w|свёрстан|отступ\w|выровн\w|выглядит\s+(ок|хорошо|норм|аккуратно|правильно|чисто)|пустое\s+место|на\s+экране/i;

  const allLines = fs.readFileSync(path, "utf8").split("\n");

  // --- Проход 0: id вызовов, ЧЕЙ tool_result — ошибка (упавший скрин ≠ скрин) ---
  const shotErrRe = /error capturing|timed out|timeout|renderer may be|###\s*error|failed to (capture|take|screenshot)|screenshot[^"]*(fail|error)/i;
  const erroredToolIds = new Set();
  for (const line of allLines) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch (err) { continue; }
    const content = e && e.message && Array.isArray(e.message.content) ? e.message.content : [];
    for (const b of content) {
      if (!b || b.type !== "tool_result") continue;
      const txt = typeof b.content === "string" ? b.content : JSON.stringify(b.content || "");
      if (b.is_error === true || shotErrRe.test(txt)) {
        if (b.tool_use_id) erroredToolIds.add(b.tool_use_id);
      }
    }
  }
  const okShot = (block) => !erroredToolIds.has(block && block.id);

  // считаем мутации/скрины ТОЛЬКО в текущем ходу (от последнего сообщения Заказчика)
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
  let completionSignal = false;
  let mobileShot = false;
  let turnText = "";
  let browserActivity = false;
  let designCriticInvoked = false;
  let i = 0;

  for (const line of allLines) {
    i++;
    if (i <= lastUserIdx + 1) continue; // считаем только после последнего user-сообщения
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch (e) { continue; }
    const content = entry && entry.message && Array.isArray(entry.message.content) ? entry.message.content : [];
    for (const block of content) {
      if (!block) continue;
      if (block.type === "text") {
        const t = String(block.text || "");
        turnText += " " + t;
        if (completionTextRe.test(t)) completionSignal = true;
      }
      if (block.type !== "tool_use") continue;
      const name = String(block.name || "");
      const inp = block.input || {};
      if (/Claude_in_Chrome|playwright/i.test(name)) browserActivity = true; // ходил в браузер
      if (/^(Skill|Agent|Task)$/i.test(name) && /design-critique/i.test(JSON.stringify(inp))) designCriticInvoked = true; // реально прогнал critique

      if (/^Bash$/.test(name) && gitCommitRe.test(String(inp.command || ""))) completionSignal = true;
      if (/playwright/i.test(name)) {
        if (playwrightShotRe.test(name) && okShot(block)) lastScreenshot = i;
        if (/browser_resize/i.test(name) && Number(inp.width) > 0 && Number(inp.width) <= 500) mobileShot = true;
      }
      if (/resize_window/i.test(name) && Number(inp.width) > 0 && Number(inp.width) <= 500) mobileShot = true;

      if (/Claude_in_Chrome/.test(name)) {
        if (/javascript_tool/.test(name) && jsMutationRe.test(String(inp.text || ""))) lastMutation = i;
        else if (/browser_batch/.test(name)) {
          const ser = JSON.stringify(inp);
          if (jsMutationRe.test(ser)) lastMutation = i;
          if (screenshotInBatchRe.test(ser) && okShot(block)) lastScreenshot = Math.max(lastScreenshot, i);
        }
        if (/computer/.test(name) && /screenshot|zoom/i.test(String(inp.action || "")) && okShot(block)) lastScreenshot = i;
        else if (/screenshot/i.test(name) && okShot(block)) lastScreenshot = i;
        else if (inp.save_to_disk === true && okShot(block)) lastScreenshot = i;
      }

      if (/^(Edit|Write|MultiEdit)$/.test(name)) {
        const file = String(inp.file_path || inp.path || "");
        const text = String(inp.new_string || inp.content || "");
        if (/TODO\.md$/i.test(file) && /\[x\]/i.test(text)) completionSignal = true; // задача закрыта
        if (docExemptRe.test(file)) continue; // локальный док проекта — не страница сайта
        if (fileVisualRe.test(file) || (fileMarkupRe.test(file) && styleMarkerRe.test(text))) lastMutation = i;
      }
    }
  }

  // 1) Жёсткая проверка: вёрстка тронута (файл/браузер), но УСПЕШНОГО скрина после неё нет.
  if (lastMutation > -1 && lastScreenshot < lastMutation) {
    process.stderr.write(
      "STOP-ХУК (визуал): была правка вёрстки/живой страницы (Elementor/WPCode/POST), но ПОСЛЕ неё нет " +
      "УСПЕШНОГО скриншота (упавший/timeout-скрин НЕ считается). Правило 2: сними скрин затронутого блока. " +
      "desktop = Chrome MCP; если он падает/timeout — СРАЗУ пробуй Playwright (browser_navigate + browser_take_screenshot). " +
      "mobile = Playwright ОБЯЗАТЕЛЬНО (browser_resize 390 → screenshot). Сравни ДО/ПОСЛЕ или с эталоном, потом «проверил визуально». " +
      "DOM-проверка (page_text/computed style) НЕ считается. Физически никак — напиши ЯВНО и попроси Заказчика глянуть."
    );
    process.exit(2);
  }

  // 2) Mobile-нудж: вёрстка тронута + завершение этапа + моб-скрин НЕ снят → напомнить 1 раз.
  if (lastMutation > -1 && completionSignal && !mobileShot) {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const statePath = root + "/.claude/visual-check-mobile-state.json";
    let st = { lastUserIdx: -1 };
    try { st = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) {}
    if (st.lastUserIdx !== lastUserIdx) {
      try { fs.writeFileSync(statePath, JSON.stringify({ lastUserIdx })); } catch (e) {}
      process.stderr.write(
        "🔔 STOP-ХУК (моб-напоминалка, НЕ запрет): завершаешь этап с правкой вёрстки. " +
        "Нужен ли скрин в МОБИЛЬНОМ вьюпорте? Затронут responsive → Playwright browser_resize 390 → screenshot, сравни. " +
        "Не затронут → ответь «моб не нужен» и завершай. Дёргаю один раз на завершение."
      );
      process.exit(2);
    }
  }

  // 3) Визуал-claim нудж: завершение + утверждение визуальной работы (создал страницу/вёрстка/
  //    «выглядит ок») + НЕТ скрина в ходу → напомнить. Ловит дыру, когда мутация не задетектена
  //    (страница создана через Bash/WP-CLI/клики), но визуальный результат заявлен.
  if (completionSignal && lastScreenshot < 0 && browserActivity && visualClaimRe.test(turnText)) {
    process.stderr.write(
      "🔔 STOP-ХУК (визуал-проверка): ты завершаешь этап с утверждением о вёрстке/странице/виде " +
      "(«создал страницу», «вёрстка», «выглядит ок» и т.п.), но скрина в этом ходу НЕТ. " +
      "DOM/page_text НЕ считается за визуальную проверку (Правила 2 и 4: «проверил» ≠ «думаю»). " +
      "Сними скрин затронутого экрана (Chrome MCP; падает → Playwright), смотри ДИЗАЙН (воздух/баланс/отбивки), не функционально — " +
      "ИЛИ напиши ЯВНО «смотрел через DOM, скрин не делал», не выдавая DOM за визуальную проверку."
    );
    process.exit(2);
  }

  // 4) Дизайн-нудж: создал НОВУЮ страницу + скрин снят, но дизайн НЕ оценён (нет design-critique
  //    и дизайн-лексики) → напомнить осознанно оценить (воздух/баланс/отбивки), не функционально.
  if (completionSignal && browserActivity && lastScreenshot >= 0) {
    const newPageRe = /(создал|сделал|сверстал|собрал)\w*\s*(нов\w*\s+)?(страниц|лендинг)|новая\s+страниц/i;
    // Суппрессор — АРТЕФАКТ (реальный вызов скилла), а не лексика: слова «воздух ок»
    // можно написать не оценивая; вызов design-critique структурно не сымитируешь.
    if (newPageRe.test(turnText) && !designCriticInvoked) {
      const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const statePath = root + "/.claude/visual-check-design-state.json";
      let st = { lastUserIdx: -1 };
      try { st = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) {}
      if (st.lastUserIdx !== lastUserIdx) {
        try { fs.writeFileSync(statePath, JSON.stringify({ lastUserIdx })); } catch (e) {}
        process.stderr.write(
          "🔔 STOP-ХУК (линзы проверки, НЕ запрет): создал новую страницу + скрин снят, но скилл design:design-critique НЕ запускался. " +
          "Скрин в глазах ≠ дизайн-взгляд, а слова «выглядит ок» можно написать не оценивая (скилл — нет). Прогони ЛИНЗЫ (см. `ЛИНЗЫ ПРОВЕРКИ.md`): " +
          "🎨 Дизайнер → `design:design-critique` (или явно обоснуй, почему полный critique не нужен) + 👤 Пользователь → реально открой и пройди страницу как посетитель (клики/чтение, не DOM). " +
          "Не оправдывай отступ числом («27px норм»)."
        );
        process.exit(2);
      }
    }
  }
  process.exit(0);
});
