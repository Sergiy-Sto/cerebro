import type { StageId, Project, Card } from '../state/types';

function formatContext(project: Project): string {
  const parts = [`ТЕМА (держи в фокусе на протяжении всего ответа): ${project.frame}`];
  if (project.constraints.length > 0)
    parts.push(`Ограничения: ${project.constraints.join('; ')}`);
  if (project.criteria.length > 0)
    parts.push(`Критерии успеха: ${project.criteria.join('; ')}`);
  return parts.join('\n');
}

function formatCards(cards: Card[]): string {
  return cards.map((c) => {
    const star = c.status === 'interesting' ? '★ ' : '';
    const conf = c.confidence && c.confidence !== 'assumed' ? ` [${c.confidence}]` : '';
    return `- [id:${c.id}] ${star}${c.title}${conf}: ${c.description}`;
  }).join('\n');
}

function existingBlock(existing: string): string {
  if (!existing) return '';
  return `\nCRITICAL — these cards already exist. You MUST NOT repeat, rephrase, or generate anything thematically similar to them:\n${existing}\n`;
}

const FMT = `ВАЖНО: Весь текст — только на русском языке. Никакого английского.

ФОРМАТ ОПИСАНИЯ (description):
- Объём: 400-800 символов. Не скупись на конкретику — поверхностное описание разрушает следующие этапы.
- Когда есть перечисление (типы, варианты, примеры, причины, признаки) — оформляй маркированным списком через переносы строк, не сплошным полотном. Пример: "Основные виды:\\n• первый — пояснение\\n• второй — пояснение\\n• третий — пояснение".
- Когда мысль линейная (структурное наблюдение, аналитический вывод) — пиши абзацами.
- Конкретные примеры всегда лучше общих слов.

ВАЖНО: символ переноса строки в JSON — это \\n внутри строки описания. Сохраняй валидный JSON.

Output each card as a separate JSON object on its own line:
{"title": "...", "description": "...", "tags": ["..."], "derived_from": ["id1", "id2"]}

Поле derived_from: массив ID карточек из контекста, на основе которых построена эта новая карточка. Если карточка построена с нуля — оставь пустым массивом [].`;

const FMT_METRICS = `ВАЖНО: Весь текст — только на русском языке. Никакого английского.

ФОРМАТ ОПИСАНИЯ (description):
- Объём: 400-800 символов.
- Перечисления — через переносы строк и маркеры (• или -), не сплошным полотном.
- Линейная мысль — абзацами.
- Переносы строк в JSON оформлять как \\n.

SELF-CHECK перед каждой идеей:
1. Если бы ты вбил эту идею в Google — она оказалась бы в топ-10 результатов? Если да — выброси и думай глубже.
2. Оцени Новизну от 1 до 10. Если < 7 — замени идею на более неожиданную, затем оценивай снова.

Output each card as a separate JSON object on its own line:
{"title": "...", "description": "...", "tags": ["..."], "derived_from": ["id1", "id2"], "metrics": {"novelty": 8, "strength": 7, "feasibility": 6, "testability": 9}, "analysis": "Новизна 8: [почему неочевидно]. Сила 7: [масштаб возможности]. Реализация 6: [что сложно]. Проверка 9: [как быстро протестировать]."}

Поле derived_from: массив ID карточек из контекста, на основе которых построена эта новая карточка.`;

type PromptFn = (ctx: string, prev: string, existing: string) => string;

const STAGE_PROMPTS: Record<StageId, PromptFn> = {

  // ───────── REALITY MAPPING ─────────

  observation: (ctx, _prev, existing) => `${ctx}
${existingBlock(existing)}
Stage: OBSERVATION SCAN
Это первый этап. Здесь НЕТ внешнего поиска — только твои знания + контекст темы. Задача: собрать предварительную карту реальности вокруг темы. Не идеи, не гипотезы — карта того, ЧТО уже существует в реальном мире вокруг этой темы.

Сгенерируй 8-12 карточек. Каждая карточка = одна категория наблюдения. Покрой следующие категории (можно выбрать 8-12 наиболее релевантных для темы):

1. ТИПЫ И РАЗНОВИДНОСТИ — какие виды/категории сущности существуют?
2. ФОРМАТЫ ИСПОЛЬЗОВАНИЯ — в каких реальных сценариях это используется?
3. СОВРЕМЕННЫЕ ВЕРСИИ — как это выглядит сейчас, последние тренды?
4. УСТАРЕВШИЕ ВЕРСИИ — как было раньше, что отмирает?
5. КРАЙНИЕ СЛУЧАИ — экзотические, нишевые, странные варианты?
6. СМЕЖНЫЕ СУЩНОСТИ — что находится рядом, часто рассматривается вместе?
7. ИЗВЕСТНЫЕ ПРОБЛЕМЫ — типичные жалобы, провалы, болевые точки?
8. ЗАМЕНИТЕЛИ — чем люди заменяют эту сущность когда не хотят/не могут её использовать?
9. СУЩЕСТВУЮЩИЕ РЕШЕНИЯ — известные продукты, сервисы, подходы решающие эту тему?
10. КУЛЬТУРНЫЕ РАЗЛИЧИЯ — как это выглядит в разных странах/контекстах?
11. ПРОБЕЛЫ В ЗНАНИЯХ — что важно проверить через поиск, что я могу не знать?
12. НЕОЧЕВИДНЫЕ ФАКТЫ — что обычно ускользает от поверхностного взгляда?

ПРАВИЛА:
- Каждая карточка должна быть конкретной, не общей.
- ОБЯЗАТЕЛЬНО разворачивай: перечисляй конкретные подтипы, примеры, варианты — НЕ оставляй на уровне абстракции. Скупое описание = разрушенный фундамент для следующих этапов.
- В категориях с перечислениями (ТИПЫ, ФОРМАТЫ, КРАЙНИЕ СЛУЧАИ, СУЩЕСТВУЮЩИЕ РЕШЕНИЯ, ЗАМЕНИТЕЛИ) — формат "вступительная фраза:\\n• пункт 1 — пояснение\\n• пункт 2 — пояснение\\n...". Минимум 4-6 пунктов в каждой такой категории.
- Если что-то — это твоё предположение, а не известный факт, отметь это в описании ("предположительно...", "стоит проверить...").
- Title формат: "<КАТЕГОРИЯ>: <конкретное наблюдение>"
- Это карта, не креатив. Не пытайся быть умным — будь точным и развёрнутым.

${FMT}`,

  search_plan: (ctx, prev, existing) => `${ctx}
${prev ? `\nObservation Scan (использовать как основу — derived_from):\n${prev}` : ''}
${existingBlock(existing)}
Stage: SEARCH PLAN
Ты НЕ выполняешь поиск. Ты формируешь план — что именно стоит искать, чтобы расширить и проверить Observation Scan.

Сгенерируй 6-8 карточек. Каждая = одно поисковое направление, привязанное к конкретным наблюдениям из Observation Scan (через derived_from).

Покрой направления (выбери 6-8 наиболее ценных):
1. КОНКРЕТНЫЕ ТИПЫ — поиск точных названий разновидностей
2. РЕАЛЬНЫЕ ПРОБЛЕМЫ — форумы, Reddit, отзывы пользователей о болях
3. СУЩЕСТВУЮЩИЕ ИНСТРУМЕНТЫ — приложения, сервисы, сайты решающие тему
4. КОНКУРЕНТЫ — кто уже работает в этой нише, что они делают
5. ЖАЛОБЫ И КРИТИКА — отзывы 1-2 звезды, что не работает в существующих решениях
6. ЗАМЕНИТЕЛИ И ОБХОДНЫЕ ПУТИ — как люди решают проблему без основного класса решений
7. МЕЖЪЯЗЫКОВОЙ СРЕЗ — что выглядит иначе в English / Polish / Ukrainian / German
8. КЛЮЧЕВЫЕ СЛОВА — точные термины, по которым искать

Каждая карточка:
- Title: "<НАПРАВЛЕНИЕ>: <конкретный запрос>"
- Description: что именно искать, какие 3-5 ключевых слов на английском (и др. языках если уместно), где искать (Reddit/Google/App Store/Product Hunt/конкретные форумы)
- derived_from: ID наблюдений, которые подсказали это направление

${FMT}`,

  search_notes: (ctx, _prev, existing) => `${ctx}
${existingBlock(existing)}
Stage: SEARCH NOTES
Это этап для РУЧНОГО ввода пользователем. Пользователь сам ищет в интернете и вставляет сюда найденное: ссылки, цитаты, скриншоты, заметки. AI здесь не генерирует.

Если ты получил этот промпт — значит произошла ошибка. Не генерируй карточки.

${FMT}`,

  reality_summary: (ctx, prev, existing) => `${ctx}
${prev ? `\nObservation Scan + Search Notes (используй как основу — derived_from):\n${prev}` : ''}
${existingBlock(existing)}
Stage: REALITY MAP SUMMARY
Сведи Observation Scan + Search Notes (если есть) в финальную карту реальности. Это финальный артефакт первого модуля — он будет основой для всех следующих этапов.

Сгенерируй 5-7 карточек. Каждая = один тип сводной информации:

1. ПОДТВЕРЖДЁННЫЕ ЭЛЕМЕНТЫ — что точно существует и подтверждено (тип сущности, основные варианты, ключевые игроки)
2. НЕПОДТВЕРЖДЁННЫЕ ПРЕДПОЛОЖЕНИЯ — что было выдвинуто как гипотеза, но не проверено
3. КЛЮЧЕВЫЕ БОЛИ И ТРЕНИЯ — самые острые проблемы из того что нашли
4. ИНТЕРЕСНЫЕ НАПРАВЛЕНИЯ — что выглядит как зацепка для дальнейшего анализа
5. ПРОБЕЛЫ В ДАННЫХ — что осталось непонятным, требует ещё ресерча
6. КЛЮЧЕВЫЕ СУЩНОСТИ ДЛЯ ENTITY MAPPING — что именно стоит разбирать дальше (одна или несколько связанных сущностей)
7. КУЛЬТУРНЫЕ / МЕЖРЫНОЧНЫЕ ИНСАЙТЫ — если есть

Каждая карточка обязана ссылаться на 2-5 ID из предыдущих этапов через derived_from. Это не декорация — это связь.

${FMT}`,

  // ───────── ENTITY MAPPING ─────────

  entity_mapping: (ctx, prev, existing) => `${ctx}
${prev ? `\nReality Map (используй как основу — derived_from):\n${prev}` : ''}
${existingBlock(existing)}
Stage: ENTITY MAPPING / ONTOLOGICAL DECOMPOSITION
Это фундамент всего дальнейшего анализа. Не реферат, не обзор — структурный X-ray сущности по фундаментальным измерениям.

Сначала определи (про себя, без карточки): сущность — это (A) физический объект, (B) процесс/деятельность, (C) система/сервис, (D) роль/профессия, (E) состояние/опыт, или (F) смешанный тип? Это определяет, какие измерения применимы.

Сгенерируй 10-14 карточек. Каждая карточка = одно фундаментальное измерение, разобранное конкретно. Покрой 10-14 измерений из списка (выбери наиболее раскрывающие эту сущность):

1. PURPOSE / НАЗНАЧЕНИЕ — для чего сущность существует? Функциональное И символическое назначение.
2. JOBS-TO-BE-DONE — какую жизненную задачу она решает для человека/бизнеса? (НЕ функция, а именно job — что человек "нанимает" её сделать)
3. USERS / ACTORS — кто взаимодействует? Раздели роли: пользователь, исполнитель, покупатель, посредник, контролёр, пострадавшая сторона.
4. RESOURCES — из чего состоит? Для объекта: материалы, детали, энергия. Для процесса: деньги, время, люди, информация, инструменты, документы, решения, внимание, доверие.
5. FORM / FORMAT — какая форма/формат? Для объекта: геометрия, размер, поверхность. Для процесса: workflow, синхронность, ритм, онлайн/офлайн.
6. STRUCTURE — как устроена внутри? Части, этапы, зависимости, модули.
7. DEPENDENCIES — на чём держится? Что должно существовать, чтобы она работала?
8. ENVIRONMENT — в какой среде существует? Физическая, социальная, экономическая, цифровая, правовая.
9. LIFECYCLE — как развивается во времени? До / во время / после. Подготовка, использование, обслуживание, завершение.
10. INTERFACES — через что человек взаимодействует? Физически, визуально, документально, через приложение, звонки.
11. VARIANTS — какие разновидности? По назначению, масштабу, цене, аудитории, сложности.
12. CONSTRAINTS — какие ограничения? Физические, финансовые, временные, когнитивные, социальные, юридические.
13. FAILURE MODES — где ломается? Где раздражает, дорожает, затягивается, даёт плохой результат?
14. SUBSTITUTES — чем заменяют? Что люди делают вместо?
15. BOUNDARY CASES — что почти является этим, но не совсем? Где расширяется граница понятия?
16. HISTORICAL EVOLUTION — старые формы, новые формы, возможные будущие формы?
17. OBLIGATORY vs ACCIDENTAL — какие признаки обязательные (без них перестаёт быть собой), какие случайные (исторические конвенции которые могут быть другими). ОЧЕНЬ ВАЖНОЕ ИЗМЕРЕНИЕ — обязательно включи.

ПРАВИЛА:
- Каждое описание заканчивай: "→ Что это даёт для трансформаций: [одна острая зацепка для следующего этапа]"
- Глубина важнее широты: одно острое наблюдение лучше трёх общих
- derived_from: ID карточек Reality Map которые подсказали это измерение
- Title формат: "<ИЗМЕРЕНИЕ>: <ключевая структурная находка>"

${FMT}`,

  // ───────── FEATURE CHALLENGE (бывший Invert) ─────────

  feature_challenge: (ctx, prev, existing) => `${ctx}
${prev ? `\nEntity Mapping (используй как основу — derived_from):\n${prev}` : ''}
${existingBlock(existing)}
Stage: FEATURE CHALLENGE / TRANSFORMATION QUESTIONS
Возьми из Entity Mapping в первую очередь карточки "OBLIGATORY vs ACCIDENTAL" и любые случайные/исторически-обусловленные признаки. Брось каждому из них вызов через серию трансформаций.

Для каждого признака задай вопросы и выбери самый продуктивный:
- Что если УБРАТЬ это?
- Что если ИНВЕРТИРОВАТЬ (сделать наоборот)?
- Что если ЗАМЕНИТЬ на противоположное?
- Что если АВТОМАТИЗИРОВАТЬ это?
- Что если ПЕРЕНЕСТИ в цифровую форму?
- Что если СДЕЛАТЬ ДО основного процесса?
- Что если СДЕЛАТЬ ПОСЛЕ?
- Что если ОТДАТЬ другой роли?
- Что если СДЕЛАТЬ ДЕШЕВЛЕ / БЫСТРЕЕ / ПРОЩЕ / ПРЕМИАЛЬНЕЕ?
- Что если СОВМЕСТИТЬ с другой сущностью?
- Что если СДЕЛАТЬ САМОВОССТАНАВЛИВАЮЩИМСЯ?

Сгенерируй 6-8 карточек. Каждая = один сильный challenge.

ПРАВИЛА:
- Не выбирай очевидные трансформации. Если challenge звучит как известный продукт — иди глубже.
- Хороший challenge вызывает мысль "стоп, а так разве можно?" — это сигнал что попал.
- Title формат: "<Тип трансформации>: <что именно меняем>"
- derived_from: ID карточек из Entity Mapping, особенно из OBLIGATORY vs ACCIDENTAL

${FMT}`,

  // ───────── остальные этапы (без принципиальных изменений) ─────────

  friction: (ctx, prev, existing) => `${ctx}
${prev ? `\nКонтекст предыдущих этапов (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Friction Map
Identify the most painful friction points in this topic. Be specific: WHO experiences it, WHEN, and what exactly breaks down. Focus on moments where time, money, or energy is wasted or where people give up. Опирайся на Failure Modes из Entity Mapping и боли из Reality Map. Generate 5 cards.
derived_from: ID карточек, особенно из Entity Mapping (FAILURE MODES) и Reality Map (КЛЮЧЕВЫЕ БОЛИ).

${FMT}`,

  contradiction: (ctx, prev, existing) => `${ctx}
${prev ? `\nКонтекст предыдущих этапов (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Contradiction Finder
Surface the core tensions in this space. Format: "X requires Y but also requires NOT-Y." These contradictions are where breakthroughs live — the places where conventional solutions fail because satisfying one requirement violates another. Generate 5 cards.
derived_from: ID точек трения и измерений из Entity Mapping.

${FMT}`,

  cross_field: (ctx, prev, existing) => `${ctx}
${prev ? `\nКонтекст предыдущих этапов (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Cross-field Transfer
For each contradiction above, find a different industry or business sector that faced a structurally identical tension and solved it.

HARD RULES:
- Priority: look in OTHER BUSINESS SECTORS first — retail, logistics, insurance, banking, pharma, real estate, franchising, B2B SaaS, media, staffing, marketplaces, manufacturing, telecom, etc.
- BANNED (too abstract, not useful for business): biology, military logistics, game design, urban planning, cooking, architecture, medieval history, nature metaphors. Reject these immediately.
- Each card MUST use a different industry. No repeats.
- The industry is chosen for STRUCTURAL FIT to this specific contradiction — not for sounding interesting.
- The more specific the business example the better: not "retail" but "fast fashion inventory management", not "banking" but "microloan underwriting in emerging markets".

For each card: name the industry + specific context, state the structural tension it faced, explain the exact mechanism it used to resolve it, map that mechanism to the original contradiction.
Title format: "<Industry>: <principle>"
derived_from: ID противоречий, для которых найдена аналогия.

${FMT}`,

  opportunity: (ctx, prev, existing) => `${ctx}
${prev ? `\nКонтекст предыдущих этапов (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Opportunity Tree
Synthesize the insights so far into concrete opportunity spaces. For each: name the beneficiary, the unmet need, and what makes it now possible. Not hypotheses yet — just directions worth exploring. Generate 5 cards.
derived_from: ID аналогов, противоречий, точек трения, JTBD.

${FMT}`,

  hypothesis: (ctx, prev, existing) => `${ctx}
${prev ? `\nКонтекст предыдущих этапов (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Hypothesis Generation
Turn the selected opportunities into testable business hypotheses. Format: "We believe [specific customer] will [specific action] because [insight], resulting in [business outcome]." Each must be falsifiable — you should be able to imagine an experiment that proves it wrong. Generate 5 cards.
derived_from: ID opportunity spaces которые гипотеза превращает в конкретику.

${FMT_METRICS}`,

  critic: (ctx, prev, existing) => `${ctx}
${prev ? `\nГипотезы для критики (★ = приоритетные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Critic Pass
For each hypothesis above, be its harshest critic. What are the 3 most likely failure modes? What assumptions must hold true? Is there prior art that tried this and failed? Be ruthlessly honest — a weak critique is useless. Generate one critique card per hypothesis.
Title format: "Критика: <hypothesis name>"
For metrics: novelty = how non-obvious this failure mode is, strength = how fatal this failure would be, feasibility = likelihood this failure actually occurs, testability = how fast you can detect this risk early.
derived_from: ID гипотезы которую критикуем.

${FMT_METRICS}`,

  shortlist: (ctx, prev, existing) => `${ctx}
${prev ? `\nГипотезы + критика (★ = особо интересные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Shortlist
${existing
  ? 'The top hypotheses are already shortlisted (shown above as already generated — do not repeat them). Now surface the NEXT TIER — hypotheses that almost made the cut but have a significant weakness. For each: explain what holds it back and under what conditions it would become stronger. These are the "dark horse" candidates. Continue numbering after the last already-generated rank.'
  : 'From the hypotheses and critiques above, select the 3-5 that best survived scrutiny. For each: explain why it made the cut — what makes it defensible, differentiated, and actionable right now. Rank them #1 being strongest.'}
Title format: "#<rank>: <hypothesis name>"
derived_from: ID гипотезы и её критики.

${FMT_METRICS}`,

  validation: (ctx, prev, existing) => `${ctx}
${prev ? `\nШортлист (★ = проверять в первую очередь):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Validation Plan
For each shortlisted hypothesis, design the cheapest and fastest test that could prove or disprove it. Specify: what exactly to test, how to test it (no-code / manual ok), what metric = true, what metric = false, and rough time+cost estimate. Generate 1-2 test cards per hypothesis.
Title format: "Тест: <what>"
For metrics: novelty = creativity of the test approach, strength = how conclusive the result will be, feasibility = cost/effort to run, testability = days to first signal.
derived_from: ID гипотезы из шортлиста которую проверяем.

${FMT_METRICS}`,

  // ───────── LEGACY (старые проекты) ─────────

  definition: (ctx, _prev, existing) => `${ctx}
${existingBlock(existing)}
[LEGACY STAGE] Это устаревший этап. Используй новый Entity Mapping.

${FMT}`,

  invert: (ctx, prev, existing) => `${ctx}
${prev ? `\nDefinition angles:\n${prev}` : ''}
${existingBlock(existing)}
[LEGACY STAGE] Это устаревший этап. Используй новый Feature Challenge.

${FMT}`,
};

export function buildPrompt(
  stageId: StageId,
  project: Project,
  prevCards: Card[],
  existingCards: Card[] = []
): string {
  const ctx = formatContext(project);
  const prev = formatCards(prevCards);
  const existing = formatCards(existingCards);
  return STAGE_PROMPTS[stageId](ctx, prev, existing);
}
