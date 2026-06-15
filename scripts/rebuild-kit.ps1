# Пересборка claude-kit-starter.zip из обновлённых generic-файлов проекта.
# Категорийное копирование: берём всё shared, КРОМЕ template-доков и project-специфичного.
# НЕ трогаем в ките: ПРОЕКТ.md / ЖУРНАЛ.html / TODO.md (шаблоны), guard-files.js (свои пути).
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
# Хуки — все, кроме project-специфичного guard-files.js
Sync-Dir '.claude\hooks' '*.js' @('guard-files.js')
# Команды, настройки, самотесты
Sync-Dir '.claude\commands' '*.md' @()
Sync-One '.claude\settings.json'
Sync-Dir 'scripts' '*.sh' @()

# template-доки и guard-files оставляем как в ките; УСТАНОВКА.md удалён ранее
$ust = Join-Path $kit 'УСТАНОВКА.md'
if (Test-Path $ust) { Remove-Item -Force $ust }

Compress-Archive -Path $kit -DestinationPath $zip -Force
Write-Output "REBUILD OK"
