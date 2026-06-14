#!/usr/bin/env node
// UserPromptSubmit hook: механическое напоминание правил.
// Каждое N-е сообщение Заказчика → полный текст CLAUDE.md принудительно
// вставляется в контекст Клода (stdout этого хука Claude Code добавляет как контекст).
// Это уровень "надо", а не "почитай, если вспомнишь".

const fs = require("fs");
const path = require("path");

const N = 15; // каждые сколько сообщений напоминать (можно поменять)

try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const counterFile = path.join(root, ".claude", "rules-counter.txt");
  const rulesFile = path.join(root, "CLAUDE.md");

  let count = 0;
  try {
    count = parseInt(fs.readFileSync(counterFile, "utf8"), 10) || 0;
  } catch (e) {}
  count++;
  fs.writeFileSync(counterFile, String(count));

  if (count % N === 0 && fs.existsSync(rulesFile)) {
    const rules = fs.readFileSync(rulesFile, "utf8");
    process.stdout.write(
      "=== АВТОНАПОМИНАНИЕ ПРАВИЛ (вставляется хуком каждые " + N + " сообщений) ===\n" +
        "Перечитай и соблюдай. Особо: визуальная правка = скриншот; инструменты прежде слов; не прерывай без нужды.\n\n" +
        rules +
        "\n=== КОНЕЦ НАПОМИНАНИЯ ===\n"
    );
  }
} catch (e) {
  // напоминание не должно ломать работу — молча пропускаем
}
process.exit(0);
