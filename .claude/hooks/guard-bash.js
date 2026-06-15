#!/usr/bin/env node
// PreToolUse hook: блокирует опасные bash-команды.
// Exit 2 = заблокировать вызов и объяснить Клоду причину (stderr).
// Работает даже в bypassPermissions — это механическая версия "поведенческих гардов".

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    const input = JSON.parse(raw);
    cmd = String((input.tool_input && input.tool_input.command) || "");
  } catch (e) {
    process.exit(0); // не смогли распарсить — не блокируем, пусть решают deny-правила
  }

  const rules = [
    [/rm\s+(-\w*\s+)*-\w*r\w*f|rm\s+-rf/i, "rm -rf запрещён хуком. Удаляй точечно, с явным путём, и только внутри проекта."],
    [/git\s+push\b[^\n]*(\s--force\b|\s-f\b)/, "git push --force запрещён. Используй обычный push; конфликт — разбери вручную."],
    [/git\s+reset\s+--hard/, "git reset --hard запрещён. Используй новые коммиты / git revert / ветки."],
    [/git\s+clean\s+-\w*f/, "git clean -f запрещён без явного запроса Заказчика."],
    [/git\s+(checkout|restore)\s+\.(\s|$)/, "checkout/restore '.' стирает незакоммиченную работу. Запрещено без явного запроса."],
    [/git\s+branch\s+-D\b/, "Принудительное удаление ветки запрещено без явного запроса."],
    [/(curl|wget)[^|;&\n]*\|\s*(ba|z|da)?sh\b/, "Pipe из интернета в shell запрещён. Скачай файл, покажи, потом исполняй."],
    [/--no-verify\b/, "--no-verify (обход хуков) запрещён без явного запроса."],
    [/\.env(\.\w+)?\b.*(>|>>|\btee\b)|(>|>>)\s*\.env/, "Запись в .env запрещена. Попроси Заказчика внести значение вручную."],
    // ПРИМЕЧАНИЕ (2026-06-15): блок compound-команд (&&/;/функции) убран. Под активным
    // Bypass встроенный permission-промпт на «обфусцированный» shell не возникает, поэтому
    // дробить команды больше не нужно. Опасные паттерны выше ловятся независимо
    // (напр. `rm -rf x && y` поймает rm-правило). Если Bypass выключен — включи его
    // (Ctrl+Shift+M → 5), а не возвращай этот блок.
  ];

  for (const [re, msg] of rules) {
    if (re.test(cmd)) {
      process.stderr.write("ЗАБЛОКИРОВАНО ХУКОМ: " + msg + "\nКоманда: " + cmd.slice(0, 200));
      process.exit(2);
    }
  }
  process.exit(0);
});
