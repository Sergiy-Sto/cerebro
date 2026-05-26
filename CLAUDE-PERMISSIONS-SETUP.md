# Closing Claude Code permission prompts — портативный гайд

> Цель: чтобы Claude Code не прерывал работу permission-промптами на каждой нетривиальной команде, при этом сохранив защиту от реальных деструктивных операций.
>
> Это **не дефолтная** настройка Claude Code. Дефолт безопаснее, но прерывает работу. Этот гайд — для **домашнего сетапа на личной машине** где удобство важнее.
>
> Файл портативный — копируй в новый проект целиком, поправь project-specific guards в CLAUDE.md.

---

## Откуда вообще проблема

Дефолт Claude Code требует permission-промпт почти на каждую Bash-команду. Allow-list через `Bash(pattern)` помогает, но имеет проблемы:

1. **Bag #29529** — `Bash(curl *)` не матчится надёжно. Известный баг, фикса нет.
2. **"Shell syntax cannot be statically analyzed"** — для составных команд (`until ... do ... done`, `if`, `for`, `VAR=x; cmd`, сложные `$(...)`) статический анализатор не может разложить на под-команды и сваливается на промпт. Allow-list тут вообще не работает.
3. **Точечные patterns не дают cache hit** — `Bash(curl -sI "https://x.com/?ts=$(date +%s)")` это точная строка, при следующем вызове `$(date)` даст другое значение → нет совпадения → новый промпт.

Итог: даже с большим allow-list'ом промпты вылазят постоянно.

---

## Решение

Перейти на `"defaultMode": "bypassPermissions"`. Это nuclear option Claude Code — скипает почти все промпты. Безопасность теперь держится **не на технических ограничениях** Claude Code, а на:

- `permissions.deny` для реально опасного (явный список, всегда блокируется)
- Circuit breakers Claude Code (rm -rf / и rm -rf ~ — встроены, не настраиваются)
- **Behavioral guards в CLAUDE.md** — список того что Claude НЕ имеет права делать без явного запроса пользователя. Это единственная защита от Claude самого себя.

Trade-off: домашний сетап на личной машине → удобство важнее, чем защита Claude от собственных ошибок.

---

## Установка: 2 файла

### 1) `.claude/settings.json` (project-level)

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "deny": [
      "Bash(rm -rf /*)",
      "Bash(rm -rf ~*)",
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(curl * | sh)",
      "Bash(curl * | bash)",
      "Bash(wget * | sh)",
      "Bash(wget * | bash)"
    ]
  }
}
```

Что блокируется явно (помимо встроенных circuit breakers):
- `rm -rf /*` и `rm -rf ~*` — деструктив больших масштабов
- Force-операции в git — `--force`, `-f`, `reset --hard`
- Pipe в shell из интернета — `curl | sh`, `wget | sh` — классический attack vector

### 2) В `CLAUDE.md` проекта — секция Behavioral Guards

Скопируй блок и **поправь под свой проект** (защищённые пути, специфичные ограничения):

```markdown
### Поведенческие гарды Claude (КРИТИЧНО — единственная защита под bypassPermissions)

Я НЕ имею права без явного запроса пользователя:
- **Force-операции в git:** push --force, push -f, reset --hard, checkout ., restore ., clean -f, branch -D
- **Destructive деплои:** трогать prod без подтверждения, удалять файлы вне рабочего проекта
- **Touch [project-specific protected paths]** — например /production-data/, /public_html/ кроме своего раздела, и т.п.
- **`npm install` глобально или вне `app/`** без объяснения зачем
- **Modify `.env`, secrets, ключи** без явного разрешения
- **Bypass хуков** через `--no-verify` / `--no-gpg-sign` без причины

Я ДОЛЖЕН перед любой потенциально необратимой операцией:
- Объяснить что собираюсь сделать и почему **до** выполнения
- Дать пользователю возможность остановить, **до** выполнения, а не "уже сделал, не нравится — откатывай"
- Использовать `git reflog`-friendly подходы (новые коммиты, не амендить; ветки, не reset)
```

---

## Активация (важно!)

Settings.json подгружается **при старте сессии** Claude Code, не приложения.

- Закрыть/открыть Claude Code Desktop **не достаточно** — существующие беседы восстановятся с теми настройками с которыми стартовали
- Нужен **новый chat / новый conversation** для подхватывания изменённого settings.json
- В текущей беседе после правки settings.json промпты будут продолжать вылетать **до её закрытия**

---

## Что НЕ делать (антипаттерны после bypassPermissions)

1. **`cd "path" && command`** — даже после bypassPermissions это может триггернуть прошку про "command changes directory before running git, which can execute untrusted hooks from the target directory". Используй вместо этого:
   - Для git: `git -C "path" <subcommand>`
   - Для npm: `npm --prefix "path" <subcommand>`  
   - Или абсолютные пути как аргументы команд

2. **Cледовать `Allow once` если промпт всё-таки вылез** — это сигнал что либо я нарушил поведенческий гард, либо settings.json не подхватился. Останавливаемся, разбираемся в причине, не нажимаем Allow слепо.

---

## Диагностика когда что-то идёт не так

### Проверить что settings.json валиден и грузится

```powershell
cat .claude/settings.json
```

Должно быть валидным JSON, `defaultMode` = `"bypassPermissions"`.

### Проверить статус сборки и деплоя (если используется CI/CD)

Нужен **`gh` CLI** (GitHub):

```powershell
winget install --id GitHub.cli   # Windows
# brew install gh                # macOS

gh auth login                    # device flow
gh run list --limit 5            # последние 5 запусков
gh run view <run-id> --log-failed   # логи провалившихся step'ов
```

Без `gh` CLI диагностика CI/CD сложна — Actions UI показывает success/failure, но не детальные логи. **WebFetch на страницу Actions неправильно парсит статусы** — не доверять, использовать `gh`.

### Локальная проверка билда такая же как в CI

❌ `npx tsc --noEmit` — недостаточно строгий, может пропускать ошибки

✅ `npm run build` — тот же путь что Actions, ловит все ошибки

---

## Безопасность под капотом

| Защита | Где живёт | Что блокирует |
|---|---|---|
| Circuit breakers Claude Code | Built-in, ненастраиваемо | `rm -rf /`, `rm -rf ~` |
| `permissions.deny` | settings.json | Кастомный список деструктива |
| Behavioral guards | CLAUDE.md | Всё остальное опасное (force-git, touch protected paths, secrets) |
| `git reflog` | Локальный git | Восстановление почти любого "ой я случайно" в течение 90 дней |

Главное: ты доверяешь Claude следовать поведенческим гардам. Если не доверяешь — не используй bypassPermissions, оставь дефолт.

---

## Когда НЕ использовать bypassPermissions

- **Shared машина** где несколько пользователей или гости
- **Сервер / VM в продакшене** где Claude трогает реальные пользовательские данные
- **Корпоративная среда** где есть managed settings от админов
- **Когда тестируешь нового непроверенного Claude** (новая версия, экспериментальный prompt) — лучше дефолт пока не убедишься в поведении

В этих случаях оставить дефолт + точечный allow-list даже если он неудобный — нормальная цена за безопасность.

---

## TL;DR — что сделать в новом проекте

1. Создать `.claude/settings.json` с `defaultMode: "bypassPermissions"` + `deny` список (см. выше)
2. В `CLAUDE.md` проекта добавить секцию "Поведенческие гарды" (см. шаблон выше), адаптировать под защищённые пути проекта
3. Закрыть текущий chat, открыть новый — bypass подхватится
4. Поставить `gh` CLI для диагностики CI/CD когда что-то идёт не так
