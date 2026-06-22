# apply-kit.ps1 — детерминированная РАСКАТКА обновления кита в проект + сверка полноты.
# Копирует generic-файлы из свежего архива в проект (по факту различий), НЕ трогает project-specific,
# и СВЕРЯЕТ до/после (хеши): «0 расхождений» = синк полный и верифицирован. Убирает ручное копирование.
#
# Запуск (работает и в pwsh 7, и в powershell.exe 5.1 — файл в UTF-8 с BOM):
#   pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/apply-kit.ps1 -Zip <архив> -Project <корень>
#   (нет pwsh → замени `pwsh` на `powershell`; -ExecutionPolicy Bypass обязателен для 5.1)
#   -Zip по умолч. ищется в корне проекта; -DryRun — показать без копирования; -Details — полные списки.
#   -Info — живая ОПИСЬ кита (сколько хуков/скриптов/доков + имена) и выход, без синка.
# Вывод по умолчанию КОРОТКИЙ: сводка + заметный вердикт-баннер последней строкой («✅ РАСХОЖДЕНИЙ НЕТ»).
param(
  [string]$Zip = '',
  [string]$Project = (Get-Location).Path,
  [switch]$DryRun,
  [switch]$Info,     # опись кита (что внутри + счётчики) и выход, без синка
  [switch]$Details   # подробности (списки файлов, пути); по умолчанию — только заметный вердикт
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
  if (Test-Path -LiteralPath $claudeMd) { $m = Select-String -LiteralPath $claudeMd -Pattern 'Версия кита:\s*([^\s*]+)'; if ($m) { return $m.Matches[0].Groups[1].Value } }
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

  if ($Info) {                                 # живая опись из архива — генерируется, не дрейфует
    $hooks=@(); $cmds=@(); $scr=@(); $rules=@(); $tpls=@(); $other=@()
    foreach ($f in $files) {
      $rel = $f.FullName.Substring($src.Length).TrimStart('\','/'); $n = Norm $rel
      if     ($n -match '^\.claude\\hooks\\.+\.js$')    { $hooks += $f.BaseName }
      elseif ($n -match '^\.claude\\commands\\.+\.md$') { $cmds  += $f.BaseName }
      elseif ($n -match '^scripts\\')                   { $scr   += $f.Name }
      elseif ($n -notmatch '\\') { if (IsExcluded $rel) { $tpls += $f.Name } else { $rules += $f.Name } }
      else { $other += $rel }
    }
    Write-Output ("=== СОСТАВ КИТА (kit @ {0}) ===" -f (Stamp (Join-Path $src 'CLAUDE.md')))
    Write-Output ("🪝 Хуки ({0}): {1}"    -f @($hooks).Count, (@($hooks) -join ', '))
    Write-Output ("⚙  Команды ({0}): {1}" -f @($cmds).Count,  (@($cmds)  -join ', '))
    Write-Output ("📜 Скрипты ({0}): {1}" -f @($scr).Count,   (@($scr)   -join ', '))
    Write-Output ("📄 Правила ({0}): {1}" -f @($rules).Count, (@($rules) -join ', '))
    Write-Output ("📄 Шаблоны ({0}): {1}" -f @($tpls).Count,  (@($tpls)  -join ', '))
    if (@($other).Count) { Write-Output ("·  Прочее ({0}): {1}" -f @($other).Count, (@($other) -join ', ')) }
    Write-Output ("Всего файлов: {0}" -f @($files).Count)
    return                                     # выходим; finally почистит tmp
  }

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

  $applN = @($applied).Count; $skipN = @($skipped).Count; $diffN = @($diffAfter).Count
  $bar = ('=' * 52)

  if ($Details) {                              # подробности — ТОЛЬКО по запросу (-Details)
    Write-Output "--- apply-kit детали ---"
    Write-Output ("Архив:  {0}" -f $Zip)
    Write-Output ("Проект: {0}" -f $Project)
    Write-Output ("Штамп кита: {0} -> {1}" -f $oldStamp, $newStamp)
    foreach ($a in $applied) { Write-Output ("  + применено: " + $a) }
    foreach ($s in $skipped) { Write-Output ("  · project-specific (не тронут): " + $s) }
  }

  if ($DryRun) {
    Write-Output ("[DryRun] обновятся: {0}" -f $(if(@($diffBefore).Count){@($diffBefore) -join ', '}else{'ничего, всё актуально'}))
  }
  else {
    # компактная сводка + ЗАМЕТНЫЙ вердикт ПОСЛЕДНЕЙ строкой
    Write-Output ("apply-kit (kit @ {0}): применено {1}, project-specific не тронуто {2}" -f $newStamp, $applN, $skipN)
    Write-Output $bar
    if ($diffN -eq 0) {
      Write-Output "  ✅  РАСХОЖДЕНИЙ НЕТ — СИНК ПОЛНЫЙ И ВЕРИФИЦИРОВАН"
      Write-Output $bar
    } else {
      Write-Output ("  ⚠️  РАСХОЖДЕНИЯ ({0}) — СИНК НЕПОЛНЫЙ:" -f $diffN)
      foreach ($d in $diffAfter) { Write-Output ("        - " + $d) }
      Write-Output $bar
      exit 1
    }
  }
} finally {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
}
