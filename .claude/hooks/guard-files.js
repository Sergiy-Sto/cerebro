#!/usr/bin/env node
// PreToolUse hook для Edit/Write/MultiEdit: защищённые файлы и пути.
// Подправь список PROTECTED под конкретный проект.

const PROTECTED = [
  /(^|[\\\/])\.env(\.\w+)?$/i,        // .env и варианты
  /(^|[\\\/])secrets?([\\\/]|$)/i,    // папки secrets/
  /(^|[\\\/])db\.json$/i,             // пример: рабочая база — не трогать
  /id_rsa|\.pem$|\.key$/i,            // ключи
  // Добавляй project-specific пути сюда, например:
  // /(^|[\\\/])production-data([\\\/]|$)/i,
];

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let file = "";
  try {
    const input = JSON.parse(raw);
    file = String((input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || "");
  } catch (e) {
    process.exit(0);
  }
  for (const re of PROTECTED) {
    if (re.test(file)) {
      process.stderr.write(
        "ЗАБЛОКИРОВАНО ХУКОМ: файл защищён (" + file + "). Изменение — только по явному запросу Заказчика, руками."
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
