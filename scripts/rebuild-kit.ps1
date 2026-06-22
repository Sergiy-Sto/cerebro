# Пересборка claude-kit-starter.zip из обновлённых generic-файлов проекта.
# Категорийное копирование: берём всё shared, КРОМЕ template-доков и project-специфичного.
# НЕ трогаем в ките: ПРОЕКТ.md / ЖУРНАЛ.html (шаблоны), guard-files.js (свои пути).
# TODO.md — впечатываем чистый канбан-шаблон (структура должна совпадать с todo-drain).
# Запуск: pwsh -File scripts/rebuild-kit.ps1
$ErrorActionPreference = 'Stop'

$base = 'C:\Users\user\Desktop\++ Клод - Ноут'
$proj = Join-Path $base 'Бизнес-Церебро'
$zip  = Join-Path $base 'claude-kit-starter.zip'
$work = Join-Path $base '_kit-rebuild'
$kit  = Join-Path $work 'claude-kit-starter'

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null

Expand-Archive -Path $zip -DestinationPath $work -Force
if (-not (Test-Path $kit)) { throw "Не найдена папка claude-kit-starter после распаковки" }

function Sync-One($rel) { Copy-Item (Join-Path $proj $rel) (Join-Path $kit $rel) -Force }
function Sync-Dir($relDir, $filter, $excludeNames) {
  Get-ChildItem (Join-Path $proj $relDir) -Filter $filter -File | Where-Object { $excludeNames -notcontains $_.Name } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $kit (Join-Path $relDir $_.Name)) -Force
  }
}

# Корневые доки правил/архитектуры (НЕ template-доки)
Sync-One 'CLAUDE.md'
Sync-One 'ХУКИ И СКРИПТЫ - АРХИТЕКТУРА.md'
Sync-One 'ЛИНЗЫ ПРОВЕРКИ.md'
# Хуки — все, кроме project-специфичного guard-files.js
Sync-Dir '.claude\hooks' '*.js' @('guard-files.js')
# Команды, настройки, самотесты
Sync-Dir '.claude\commands' '*.md' @()
Sync-One '.claude\settings.json'
Sync-Dir 'scripts' '*.sh' @()
Sync-One 'scripts\apply-kit.ps1'       # раскатка со сверкой — едет в проекты (rebuild-kit.ps1 — нет, он build-only)
Sync-One 'scripts\test-apply-kit.ps1'

# template-доки и guard-files оставляем как в ките; УСТАНОВКА.md удалён ранее
$ust = Join-Path $kit 'УСТАНОВКА.md'
if (Test-Path $ust) { Remove-Item -Force $ust }

# Чистый канбан-шаблон TODO.md (имена секций совпадают с todo-drain.js)
$todoTpl = @'
# 📋 TODO — канбан задач

_(справка по статусам и формату — в конце файла, сворачивается)_

---

## 🟢 В РАБОТЕ

_(пусто)_

---

## 🟧 ОЖИДАЕТ РЕШЕНИЯ ЗАКАЗЧИКА

---

## 🟣 ПОЗЖЕ / ОТЛОЖЕНО

---

## 🧊 ИДЕИ — когда-нибудь (без «Готово =»)

---

## ℹ️ Как вести этот файл (справка — сворачивается)

> **Статусы = секции выше, сверху вниз по приоритету:**
> 🟢 **В РАБОТЕ** — решено, делаем; порядок = очередь (верх = следующая). Хук todo-drain гонит брать следующую `[ ]`. Не «одна задача» — независимые можно параллелить. Наполняет Claude (очевидное/безопасное сам; крупное/рискованное — сначала спрашивает).
> 🟧 **ОЖИДАЕТ РЕШЕНИЯ ЗАКАЗЧИКА** — мяч на стороне Заказчика: нужен ответ/выбор. Активна, не «потом».
> 🟣 **ПОЗЖЕ / ОТЛОЖЕНО** — сформулирована (есть «Готово =»), но припаркована. Хук НЕ гонит.
> 🧊 **ИДЕИ** — абстрактные, ещё не проработаны, без «Готово =». Каждая с 💡 и пустой строкой между ними.
> ✅ Готово → вычеркнуть отсюда и записать в ЖУРНАЛ (Историю решений). Здесь готовое НЕ копим.
>
> **Формат карточки:** `- [маркер]🟢/🟧/🟣 **Заголовок**` — эмодзи статуса В НАЧАЛЕ строки + «Описание: что/зачем» + «На карандаше: нюансы» (если есть) + «Готово = критерий». ❓ ТОЛЬКО на строке вопроса. Карточки разделяй `---`.
> Принцип «В РАБОТЕ vs ПОЗЖЕ» = «можно брать прямо сейчас?» (да → В РАБОТЕ; припаркована → ПОЗЖЕ).
> Маркеры для хука: `[ ]` не начата · `[~]` в работе · `[x]` готова · `[?]` ждёт решения Заказчика.
'@
Set-Content -Path (Join-Path $kit 'TODO.md') -Value $todoTpl -Encoding utf8

# Чистый шаблон ПЕРЕДАЧА.md (снимок сессии — читается первым на старте)
$peredachaTpl = @'
# 🚦 ПЕРЕДАЧА — снимок сессии для следующего захода

> Живой документ — перезаписывается по `/journal` или «передай». Читается ПЕРВЫМ на старте: контекст за 30 сек. Не путать с `ЖУРНАЛ.html` (append-only хроника) и `TODO.md` (очередь задач).

**Конец сессии:** —. **Машина:** —.

---

## 🎯 Что только что сделано
_(заполняется в конце сессии командой /journal)_

## 🚨 Что КРИТИЧНО на старте новой сессии
- Включи **Bypass permissions** (`Ctrl+Shift+M` → `5`) — иначе промпты на каждую команду.
- Хуки активируются только в НОВОЙ сессии; самотест `rm -rf /несуществующая-папка-тест` → должно блокнуться.

## ▶️ Что первым по задачам
_(см. `TODO.md` → 🟢 В РАБОТЕ)_
'@
Set-Content -Path (Join-Path $kit 'ПЕРЕДАЧА.md') -Value $peredachaTpl -Encoding utf8

Compress-Archive -Path $kit -DestinationPath $zip -Force

# чистим за собой — иначе _kit-rebuild висит после каждого билда (намусоривание)
Remove-Item -Recurse -Force $work
Write-Output "REBUILD OK"
