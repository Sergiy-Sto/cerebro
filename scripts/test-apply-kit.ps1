# Тест apply-kit.ps1 — хермет: синтетический архив + фейк-проект, без зависимости от реального кита.
# Проверяет: generic-файлы обновлены, project-specific (TODO/ПЕРЕДАЧА/ПРОЕКТ/ЖУРНАЛ/guard-files) сохранены,
# не-архивные файлы не тронуты, итог «0 расхождений».
# Запуск: pwsh -NoProfile -File scripts/test-apply-kit.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$apply = Join-Path $PSScriptRoot 'apply-kit.ps1'
$pass = 0; $fail = 0
function Check($name, $cond) { if ($cond) { Write-Output "  OK  [$name]"; $script:pass++ } else { Write-Output "  FAIL[$name]"; $script:fail++ } }

$work = Join-Path ([IO.Path]::GetTempPath()) ("kit-test-" + [guid]::NewGuid().ToString('N').Substring(0,8))
$kitSrc = Join-Path $work 'claude-kit-starter'
$proj   = Join-Path $work 'proj'
try {
  # 1) синтетический кит (то, что «приехало» в архиве — generic v2 + ШАБЛОНЫ project-specific)
  New-Item -ItemType Directory -Force -Path (Join-Path $kitSrc '.claude\hooks') | Out-Null
  Set-Content -LiteralPath (Join-Path $kitSrc 'CLAUDE.md')               -Value 'generic v2' -NoNewline
  Set-Content -LiteralPath (Join-Path $kitSrc '.claude\hooks\sample.js') -Value 'hook v2'    -NoNewline
  Set-Content -LiteralPath (Join-Path $kitSrc '.claude\hooks\guard-files.js') -Value 'STUB paths' -NoNewline
  Set-Content -LiteralPath (Join-Path $kitSrc 'TODO.md')                -Value 'TEMPLATE todo' -NoNewline
  Set-Content -LiteralPath (Join-Path $kitSrc 'ПРОЕКТ.md')              -Value 'TEMPLATE проект' -NoNewline
  $zip = Join-Path $work 'claude-kit-starter.zip'
  Compress-Archive -Path $kitSrc -DestinationPath $zip -Force

  # 2) фейк-проект (старые generic + СВОИ project-specific + не-архивный файл)
  New-Item -ItemType Directory -Force -Path (Join-Path $proj '.claude\hooks') | Out-Null
  Set-Content -LiteralPath (Join-Path $proj 'CLAUDE.md')               -Value 'generic v1 OLD' -NoNewline
  Set-Content -LiteralPath (Join-Path $proj '.claude\hooks\sample.js') -Value 'hook v1 OLD'    -NoNewline
  Set-Content -LiteralPath (Join-Path $proj '.claude\hooks\guard-files.js') -Value 'MY paths' -NoNewline
  Set-Content -LiteralPath (Join-Path $proj 'TODO.md')                -Value 'MY real todo' -NoNewline
  Set-Content -LiteralPath (Join-Path $proj 'ПРОЕКТ.md')              -Value 'MY real проект' -NoNewline
  Set-Content -LiteralPath (Join-Path $proj 'ЖУРНАЛ.html')            -Value 'MY journal' -NoNewline

  # 3) раскатка
  $out = & pwsh -NoProfile -File $apply -Zip $zip -Project $proj 2>&1 | Out-String
  Write-Output "--- вывод apply-kit ---"; Write-Output $out.Trim(); Write-Output "---"

  function Get-($p) { Get-Content -LiteralPath (Join-Path $proj $p) -Raw }
  Check "generic CLAUDE.md обновлён (v1->v2)"        ((Get- 'CLAUDE.md') -eq 'generic v2')
  Check "generic hook обновлён"                      ((Get- '.claude\hooks\sample.js') -eq 'hook v2')
  Check "project TODO.md сохранён (не затёрт шаблоном)"  ((Get- 'TODO.md') -eq 'MY real todo')
  Check "project ПРОЕКТ.md СОХРАНён"                 ((Get- 'ПРОЕКТ.md') -eq 'MY real проект')
  Check "project guard-files.js СОХРАНён"            ((Get- '.claude\hooks\guard-files.js') -eq 'MY paths')
  Check "не-архивный ЖУРНАЛ.html не тронут"          ((Get- 'ЖУРНАЛ.html') -eq 'MY journal')
  Check "вывод: 0 расхождений"                       ($out -match '0 расхождений')

  # 4) повторный прогон идемпотентен — применять нечего
  $out2 = & pwsh -NoProfile -File $apply -Zip $zip -Project $proj 2>&1 | Out-String
  Check "идемпотентность: повторно применено 0"      ($out2 -match 'Применено файлов: 0')
}
finally {
  if (Test-Path $work) { Remove-Item -Recurse -Force $work }
}
Write-Output "Итог: PASS=$pass FAIL=$fail"
if ($fail -ne 0) { exit 1 }
