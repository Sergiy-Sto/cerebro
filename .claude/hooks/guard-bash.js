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
    // Механизация Правила 15: compound-команды дают встроенный permission-промпт Заказчику.
    [/&&|\|\||;\s|;\s*$|\(\)\s*\{/, "Compound-команда (&&/;/shell-функция) триггерит встроенный permission-промпт у Заказчика. Разбей на отдельные простые команды ИЛИ вынеси в scripts/ и запусти `bash scripts/x.sh` (Правило 15)."],
  ];

  for (const [re, msg] of rules) {
    if (re.test(cmd)) {
      process.stderr.write("ЗАБЛОКИРОВАНО ХУКОМ: " + msg + "\nКоманда: " + cmd.slice(0, 200));
      process.exit(2);
    }
  }
  process.exit(0);
});
