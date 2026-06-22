# apply-kit.ps1 — детерминированная РАСКАТКА обновления кита в проект + сверка полноты.
# Копирует generic-файлы из свежего архива в проект (по факту различий), НЕ трогает project-specific,
# и СВЕРЯЕТ до/после (хеши): «0 расхождений» = синк полный и верифицирован. Убирает ручное копирование.
#
# Запуск из корня проекта:
#   pwsh -NoProfile -File scripts/apply-kit.ps1                 # архив берётся из корня проекта
#   pwsh -NoProfile -File scripts/apply-kit.ps1 -Zip <путь>     # явный путь к claude-kit-starter.zip
#   ... -Project <корень>   (по умолч. текущая папка)
#   ... -DryRun             (только показать, что разойдётся — без копирования)
param(
  [string]$Zip = '',
  [string]$Project = (Get-Location).Path,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

# project-specific — НИКОГДА не перезаписываем (в архиве это ШАБЛОНЫ, у проекта — реальные данные)
$EXCLUDE = @('TODO.md','ПЕРЕДАЧА.md','ПРОЕКТ.md','ЖУРНАЛ.html', '.claude\hooks\guard-files.js')

if (-not $Zip) { $Zip = Join-Path $Project 'claude-kit-starter.zip' }
if (-not (Test-Path $Zip)) { throw "Архив не найден: $Zip  (положи claude-kit-starter.zip в корень проекта или укажи -Zip)" }
if (-not (Test-Path $Project)) { throw "Проект не найден: $Project" }
$Project = (Resolve-Path $Project).Path

function Norm($p) { return ($p -replace '/','\').TrimStart('\') }
function FHash($p) { if (Test-Path -LiteralPath $p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash } else { '' } }
function IsExcluded($rel) { foreach ($e in $EXCLUDE) { if ((Norm $e) -ieq (Norm $rel)) { return $true } } return $false }
function Stamp($claudeMd) {
  if (Test-Path -LiteralPath $claudeMd) { $m = Select-String -LiteralPath $claudeMd -Pattern 'Версия кита:\s*(\S+)'; if ($m) { return $m.Matches[0].Groups[1].Value } }
  return '?'
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("kit-apply-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Expand-Archive -Path $Zip -DestinationPath $tmp -Force   # Expand-Archive, НЕ unzip — кириллица цела
  $src = Join-Path $tmp 'claude-kit-starter'
  if (-not (Test-Path $src)) { throw "В архиве нет папки claude-kit-starter" }
  $src = (Resolve-Path $src).Path

  $cl = Join-Path $Project 'CLAUDE.md'
  $oldStamp = Stamp $cl
  $files = Get-ChildItem -Path $src -Recurse -File

  $applied = @(); $skipped = @(); $diffBefore = @()
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length).TrimStart('\','/')
    if (IsExcluded $rel) { $skipped += $rel; continue }
    $dst = Join-Path $Project $rel
    if ((FHash $f.FullName) -ne (FHash $dst)) {
      $diffBefore += $rel
      if (-not $DryRun) {
        $dd = Split-Path $dst -Parent
        if (-not (Test-Path $dd)) { New-Item -ItemType Directory -Path $dd -Force | Out-Null }
        Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
        $applied += $rel
      }
    }
  }

  # ПОСТ-сверка: пройтись ещё раз — расхождений быть не должно
  $diffAfter = @()
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length).TrimStart('\','/')
    if (IsExcluded $rel) { continue }
    if ((FHash $f.FullName) -ne (FHash (Join-Path $Project $rel))) { $diffAfter += $rel }
  }
  $newStamp = Stamp $cl

  Write-Output "=== APPLY-KIT ==="
  Write-Output ("Архив:  {0}" -f $Zip)
  Write-Output ("Проект: {0}" -f $Project)
  if ($DryRun) {
    Write-Output ("[DryRun] Обновятся ({0}): {1}" -f @($diffBefore).Count, $(if(@($diffBefore).Count){@($diffBefore) -join ', '}else{'ничего, всё актуально'}))
    Write-Output ("Пропущено project-specific: {0}" -f @($skipped).Count)
  } else {
    Write-Output ("Применено файлов: {0}" -f @($applied).Count)
    foreach ($a in $applied) { Write-Output ("  + " + $a) }
    Write-Output ("Штамп кита: {0} -> {1}" -f $oldStamp, $newStamp)
    Write-Output ("Пропущено project-specific: {0} ({1})" -f @($skipped).Count, (@($skipped) -join ', '))
    if (@($diffAfter).Count -eq 0) {
      Write-Output "СВЕРКА: ✅ 0 расхождений — синк полный и верифицирован."
    } else {
      Write-Output ("СВЕРКА: ⚠️⚠️⚠️ ОСТАЛИСЬ РАСХОЖДЕНИЯ ({0}): {1}" -f @($diffAfter).Count, (@($diffAfter) -join ', '))
      exit 1
    }
  }
} finally {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}
