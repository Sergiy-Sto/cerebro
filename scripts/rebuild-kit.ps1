# Пересборка claude-kit-starter.zip из обновлённых generic-файлов проекта.
# Template-доки (ПРОЕКТ/ЖУРНАЛ/TODO) и project-специфичный guard-files НЕ трогаем.
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

# 6 изменённых generic-файлов: проект -> кит
$files = @(
  'CLAUDE.md',
  'ХУКИ И СКРИПТЫ - АРХИТЕКТУРА.md',
  '.claude\hooks\guard-bash.js',
  '.claude\hooks\guard-subagent.js',
  'scripts\test-guard-bash.sh',
  'scripts\test-subagent.sh'
)
foreach ($f in $files) {
  Copy-Item (Join-Path $proj $f) (Join-Path $kit $f) -Force
}

# удалить УСТАНОВКА.md из кита
$ust = Join-Path $kit 'УСТАНОВКА.md'
if (Test-Path $ust) { Remove-Item -Force $ust }

# пересобрать архив (перезапись)
Compress-Archive -Path $kit -DestinationPath $zip -Force

Write-Output "REBUILD OK"
