import type { StageId, Project, Card } from '../state/types';
import { buildPrompt } from './prompts';
import { appendCostEntry } from './costLog';

/** Опциональный контекст для cost logging. */
export interface LogContext {
  projectId: string;
  projectTitle: string;
  stageId: string;
  stageLabel: string;
}

const API_KEY_STORAGE = 'cerebro_openai_key';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? '';
}

export function saveApiKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(API_KEY_STORAGE, trimmed);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
  }
}

export interface GeneratedCard {
  title: string;
  description: string;
  tags: string[];
  metrics?: { novelty: number; strength: number; feasibility: number; testability: number };
  analysis?: string;
  derivedFromIds?: string[];
  sources?: { title: string; url: string }[];
}

function parseCard(line: string): GeneratedCard | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const title = String(obj.title ?? '').trim();
    if (!title) return null;

    let metrics: GeneratedCard['metrics'];
    if (obj.metrics && typeof obj.metrics === 'object') {
      const m = obj.metrics as Record<string, unknown>;
      metrics = {
        novelty: Math.min(10, Math.max(0, Number(m.novelty) || 0)),
        strength: Math.min(10, Math.max(0, Number(m.strength) || 0)),
        feasibility: Math.min(10, Math.max(0, Number(m.feasibility) || 0)),
        testability: Math.min(10, Math.max(0, Number(m.testability) || 0)),
      };
    }

    const derivedFromIds = Array.isArray(obj.derived_from)
      ? (obj.derived_from as unknown[]).map(String).filter(Boolean)
      : undefined;

    return {
      title,
      description: String(obj.description ?? '').trim(),
      tags: Array.isArray(obj.tags) ? (obj.tags as unknown[]).map(String) : [],
      metrics,
      analysis: obj.analysis ? String(obj.analysis).trim() : undefined,
      derivedFromIds,
    };
  } catch {
    return null;
  }
}

/**
 * One-shot generation of Google search queries based on Observation Scan cards.
 * Returns array of short, ready-to-search queries (in English for better coverage).
 */
/** Modern models that don't accept custom temperature (must use default = 1). */
function supportsCustomTemperature(model: string): boolean {
  if (model.startsWith('o')) return false;        // o3, o4-mini reasoning models
  if (model.startsWith('gpt-5')) return false;    // gpt-5.x family
  return true;                                    // gpt-4.x, older models — ok
}

/** Models that use max_completion_tokens instead of standard params. */
function isReasoningModel(model: string): boolean {
  return model.startsWith('o');
}

export async function generateCardsStream(
  stageId: StageId,
  project: Project,
  apiKey: string,
  contextCards: Card[],
  existingCards: Card[] = [],
  onCard: (card: GeneratedCard) => void,
  model = 'gpt-5.5',
  logContext?: LogContext,
  signal?: AbortSignal
): Promise<void> {
  const prompt = buildPrompt(stageId, project, contextCards, existingCards);
  let usagePromptTokens = 0;
  let usageCompletionTokens = 0;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `Ты — опытный продакт-менеджер. Объясняешь коллеге за чашкой кофе.

Твоя аудитория — владелец малого бизнеса. Он не читает HBR. Он не использует слова "парадигма", "категориальный сдвиг", "трансфигурация", "ценностный континуум". Он говорит конкретно: деньги, люди, время, проблема, заявка, доплата, риск.

Твой главный страх — что собеседник через 10 секунд скажет "не понял". Поэтому ты пишешь так, чтобы понял с первого раза. Если используешь специальный термин — сразу объясняешь в скобках.

Технические правила формата:
- Output ТОЛЬКО raw JSON objects, один на строку. Без markdown, без преамбул, без объяснений вокруг.
- Все тексты внутри JSON — только на русском языке.
- Не пиши академично. Пиши как человек человеку.`,
        },
        { role: 'user', content: prompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
      ...(isReasoningModel(model) ? { max_completion_tokens: 8000 } : {}),
      ...(supportsCustomTemperature(model) ? { temperature: 0.85 } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `OpenAI error ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let contentBuffer = '';
  let totalContentChars = 0; // вся длина пришедшего content для fallback оценки tokens

  function flushLines() {
    const lines = contentBuffer.split('\n');
    contentBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const card = parseCard(line);
      if (card) onCard(card);
    }
  }

  function flushAll() {
    flushLines();
    const card = parseCard(contentBuffer);
    if (card) { onCard(card); contentBuffer = ''; }
  }

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const sseLines = sseBuffer.split('\n');
    sseBuffer = sseLines.pop() ?? '';

    for (const sseLine of sseLines) {
      if (!sseLine.startsWith('data: ')) continue;
      const data = sseLine.slice(6).trim();
      if (data === '[DONE]') { flushAll(); streamDone = true; break; }

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          contentBuffer += delta;
          totalContentChars += delta.length;
          flushLines();
        }
        // Usage приходит в финальном chunk когда stream_options.include_usage=true
        if (chunk.usage) {
          usagePromptTokens = chunk.usage.prompt_tokens ?? 0;
          usageCompletionTokens = chunk.usage.completion_tokens ?? 0;
        }
      } catch { /* malformed SSE chunk */ }
    }
  }

  flushAll();

  // Fallback: если OpenAI не отдала usage — оцениваем по длине (1 token ≈ 4 chars).
  // Не идеально точно. Для русского текста ~2.5 chars/token, для English ~4, JSON ~3.
  // Берём 2.5 как взвешенное среднее для нашего русско-доминантного контента.
  if (usagePromptTokens === 0) usagePromptTokens = Math.ceil(prompt.length / 2.5);
  if (usageCompletionTokens === 0) usageCompletionTokens = Math.ceil(totalContentChars / 2.5);

  // Лог пишем ВСЕГДА если есть logContext (раньше пропускали при 0 — теряли вызовы)
  if (logContext) {
    appendCostEntry({
      ...logContext,
      model,
      inputTokens: usagePromptTokens,
      outputTokens: usageCompletionTokens,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Web Search Stream — Responses API + built-in web_search tool
// Используется в под-модуле 1.2 Search Scan
// ─────────────────────────────────────────────────────────────────────

export interface SearchProgress {
  phase: 'searching' | 'writing' | 'done';
  queriesCount?: number;
  currentQuery?: string;
}

/**
 * Генерирует карточки Search Scan через OpenAI Responses API + web_search tool.
 * Модель сама делает 8-12 поисковых запросов через built-in web_search и синтезирует
 * найденное в карточки с источниками. Карточки получают confidence='search_snippet_supported'.
 *
 * Поддерживает streaming: onCard вызывается при появлении новой карточки,
 * onProgress — при изменении фазы (поиск / написание / готово).
 *
 * Стоимость: ~$0.50-0.70 за вызов при 8-12 поисках (per OpenAI pricing 2026).
 */
export async function generateWithSearchStream(
  stageId: StageId,
  project: Project,
  apiKey: string,
  contextCards: Card[],
  existingCards: Card[] = [],
  onCard: (card: GeneratedCard) => void,
  onProgress?: (p: SearchProgress) => void,
  model = 'gpt-5.5',
  logContext?: LogContext,
  signal?: AbortSignal
): Promise<void> {
  const prompt = buildPrompt(stageId, project, contextCards, existingCards);
  let usageInput = 0;
  let usageOutput = 0;
  let totalDeltaChars = 0;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: `Ты — опытный продакт-менеджер с доступом к интернет-поиску. Объясняешь коллеге за чашкой кофе.

Твоя аудитория — владелец малого бизнеса. Он не использует жаргон. Он говорит конкретно: деньги, заявка, доплата, риск. Твой страх — "не понял" через 10 сек.

Используй web_search до 12 раз чтобы наполнить карту реальности живыми данными. Не academic write-up — просто факты из реального рынка.

Технические правила:
- Output ТОЛЬКО raw JSON objects, один на строку. Без markdown.
- Все тексты на русском.
- Пиши как человек, не как HBR.`,
        },
        { role: 'user', content: prompt },
      ],
      tools: [{ type: 'web_search' }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `OpenAI Responses API error ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let contentBuffer = '';
  let searchCount = 0;
  // Накапливаем источники из аннотаций — потом прикрепим к последней карточке
  const pendingSources: { title: string; url: string }[] = [];

  function flushLines() {
    const lines = contentBuffer.split('\n');
    contentBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const card = parseCard(line);
      if (card) {
        if (pendingSources.length > 0) {
          card.sources = [...pendingSources];
          pendingSources.length = 0;
        }
        onCard(card);
      }
    }
  }

  function flushAll() {
    flushLines();
    const card = parseCard(contentBuffer);
    if (card) {
      if (pendingSources.length > 0) card.sources = [...pendingSources];
      onCard(card);
      contentBuffer = '';
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const sseLines = sseBuffer.split('\n');
    sseBuffer = sseLines.pop() ?? '';

    for (const sseLine of sseLines) {
      if (!sseLine.startsWith('data: ')) continue;
      const data = sseLine.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data) as {
          type?: string;
          delta?: string;
          item?: { type?: string; action?: { query?: string } };
          annotation?: { type?: string; url?: string; title?: string };
          response?: { usage?: { input_tokens?: number; output_tokens?: number } };
        };

        // Текстовая дельта — основной выход модели
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          contentBuffer += event.delta;
          totalDeltaChars += event.delta.length;
          flushLines();
        }

        // Аннотация (источник) — добавляется к выводу
        if (event.type === 'response.output_text.annotation.added' && event.annotation) {
          const a = event.annotation;
          if (a.url) {
            pendingSources.push({ title: a.title ?? a.url, url: a.url });
          }
        }

        // Web search call события
        if (event.type === 'response.web_search_call.in_progress' || event.type === 'response.web_search_call.searching') {
          searchCount++;
          const q = event.item?.action?.query;
          onProgress?.({ phase: 'searching', queriesCount: searchCount, currentQuery: q });
        }

        if (event.type === 'response.output_item.added' && event.item?.type === 'message') {
          onProgress?.({ phase: 'writing', queriesCount: searchCount });
        }

        if (event.type === 'response.completed') {
          flushAll();
          if (event.response?.usage) {
            usageInput = event.response.usage.input_tokens ?? 0;
            usageOutput = event.response.usage.output_tokens ?? 0;
          }
          // Fallback оценка если usage не пришёл
          if (usageInput === 0) usageInput = Math.ceil(prompt.length / 2.5);
          if (usageOutput === 0) usageOutput = Math.ceil(totalDeltaChars / 2.5);
          onProgress?.({ phase: 'done', queriesCount: searchCount });
          if (logContext) {
            appendCostEntry({
              ...logContext,
              model,
              inputTokens: usageInput,
              outputTokens: usageOutput,
              webSearchCalls: searchCount,
            });
          }
          return;
        }
      } catch { /* malformed SSE chunk */ }
    }
  }

  flushAll();
  onProgress?.({ phase: 'done', queriesCount: searchCount });
  if (usageInput === 0) usageInput = Math.ceil(prompt.length / 4);
  if (usageOutput === 0) usageOutput = Math.ceil(totalDeltaChars / 4);
  if (logContext) {
    appendCostEntry({
      ...logContext,
      model,
      inputTokens: usageInput,
      outputTokens: usageOutput,
      webSearchCalls: searchCount,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────
// Card Q&A — обычный chat с моделью о конкретной карточке
// Используется в кнопке "💬 Задать вопрос" на карточке
// ─────────────────────────────────────────────────────────────────────

export interface CardChatContext {
  card: Card;
  /** Родительские карточки (через derivedFromIds) — для глубины контекста. */
  ancestorCards: Card[];
  /** Текущая стадия и тема проекта — чтобы модель помнила контекст методологии. */
  projectFrame: string;
  stageLabel: string;
  /** Предыдущие вопросы-ответы по этой карточке (если есть). */
  history?: Array<{ q: string; a: string }>;
}

function buildCardChatMessages(ctx: CardChatContext, newQuestion: string): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const { card, ancestorCards, projectFrame, stageLabel, history = [] } = ctx;

  const systemPrompt = `Ты — аналитик и со-автор бизнес-методологии Creative Core Workbench.
Пользователь работает над темой "${projectFrame}" и сейчас читает одну из карточек на этапе "${stageLabel}".
Он задаёт уточняющий вопрос о содержании этой карточки.

Твоя задача:
- Ответить кратко и по делу (3-7 предложений или короткий список).
- Простым человеческим языком. Если в карточке был жаргон или термин — раскрой его в скобках.
- Связь с контекстом методологии важна: если вопрос требует — упомяни связанные родительские карточки или сосседние понятия.
- Если ты не знаешь точного ответа — честно скажи: "точно не знаю, стоит проверить поиском".
- НЕ генерируй новые карточки. НЕ предлагай гипотезы. Просто отвечай на вопрос.
- Язык — русский. Markdown-форматирование (списки, **bold**) разрешается, рендеринг это поддерживает.`;

  const ancestorsBlock = ancestorCards.length > 0
    ? `\n\n--- Родительские карточки (контекст из предыдущих этапов) ---\n` +
      ancestorCards.map((c) => `[${c.id}] ${c.title}\n${c.description}`).join('\n\n')
    : '';

  const cardBlock = `--- Карточка о которой вопрос ---
Заголовок: ${card.title}

Описание:
${card.description}

${card.tags.length > 0 ? `Теги: ${card.tags.join(', ')}` : ''}
${card.metrics ? `Метрики: Новизна ${card.metrics.novelty}/10 · Сила ${card.metrics.strength}/10 · Реализация ${card.metrics.feasibility}/10 · Проверяемость ${card.metrics.testability}/10` : ''}
${card.analysis ? `Анализ метрик: ${card.analysis}` : ''}
${card.sources && card.sources.length > 0 ? `Источники: ${card.sources.map((s) => s.url).join(', ')}` : ''}${ancestorsBlock}`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: cardBlock },
  ];

  // Добавляем историю Q&A если есть
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.q });
    messages.push({ role: 'assistant', content: turn.a });
  }

  // Новый вопрос
  messages.push({ role: 'user', content: newQuestion });

  return messages;
}

/**
 * Streaming Q&A о карточке.
 * onDelta — частичные текстовые дельты ответа (для живого вывода в UI).
 * Резолвится финальным { fullAnswer, tokensIn, tokensOut }.
 */
export async function askQuestionStream(
  ctx: CardChatContext,
  newQuestion: string,
  apiKey: string,
  onDelta: (chunk: string) => void,
  model = 'gpt-5.5',
  logContext?: LogContext,
  signal?: AbortSignal
): Promise<{ fullAnswer: string; tokensIn: number; tokensOut: number }> {
  const messages = buildCardChatMessages(ctx, newQuestion);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(isReasoningModel(model) ? { max_completion_tokens: 4000 } : {}),
      ...(supportsCustomTemperature(model) ? { temperature: 0.5 } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `OpenAI error ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let fullAnswer = '';
  let usageIn = 0;
  let usageOut = 0;
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const sseLines = sseBuffer.split('\n');
    sseBuffer = sseLines.pop() ?? '';

    for (const sseLine of sseLines) {
      if (!sseLine.startsWith('data: ')) continue;
      const data = sseLine.slice(6).trim();
      if (data === '[DONE]') { streamDone = true; break; }

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullAnswer += delta;
          onDelta(delta);
        }
        if (chunk.usage) {
          usageIn = chunk.usage.prompt_tokens ?? 0;
          usageOut = chunk.usage.completion_tokens ?? 0;
        }
      } catch { /* malformed SSE chunk */ }
    }
  }

  // Fallback если usage не пришёл
  if (usageIn === 0) {
    const promptLen = messages.reduce((s, m) => s + m.content.length, 0);
    usageIn = Math.ceil(promptLen / 2.5);
  }
  if (usageOut === 0) usageOut = Math.ceil(fullAnswer.length / 2.5);

  if (logContext) {
    appendCostEntry({
      ...logContext,
      stageLabel: `${logContext.stageLabel} (вопрос к карточке)`,
      model,
      inputTokens: usageIn,
      outputTokens: usageOut,
    });
  }

  return { fullAnswer, tokensIn: usageIn, tokensOut: usageOut };
}

// ─────────────────────────────────────────────────────────────────────
// Validation plan для одной конкретной гипотезы (on-demand)
// Используется кнопкой "🧪 План валидации" на карточках 4.3 / 4.5
// Вместо обязательного 4.6 Validation стейджа (удалён 2026-05-26)
// ─────────────────────────────────────────────────────────────────────

export interface ValidationPlanContext {
  /** Сама гипотеза для которой строим план */
  hypothesis: Card;
  /** Родительские карточки (через derivedFromIds — для глубины контекста). Опционально. */
  ancestorCards?: Card[];
  /** Тема проекта и опциональные ограничения/критерии */
  projectFrame: string;
  projectConstraints?: string[];
  projectCriteria?: string[];
}

function buildValidationPlanMessages(ctx: ValidationPlanContext): Array<{ role: 'system' | 'user'; content: string }> {
  const { hypothesis, ancestorCards = [], projectFrame, projectConstraints = [], projectCriteria = [] } = ctx;

  const systemPrompt = `Ты — опытный продакт-аналитик. Помогаешь владельцу малого бизнеса спланировать проверку конкретной гипотезы максимально дёшево и быстро.

Принципы:
- Минимум денег и времени. Если есть выбор между интервью с 5 людьми ($0) и пилотом в реальном продукте ($5000) — начинай с интервью.
- Конкретные цифры в плане: сколько респондентов, сколько денег на рекламу, сколько дней, какой порог "сработало".
- Простой человеческий язык. Не "конверсия в воронке onboarding", а "сколько людей нажмут кнопку".
- Для radical гипотез (категориально новых) — двухшаговый план: сначала "понимают ли концепт", потом "купят ли". Не смешивай в один тест.
- Markdown-форматирование (заголовки, списки, **bold**) разрешается — рендеринг это поддерживает.`;

  const contextBlock = [
    `--- Тема проекта ---`,
    projectFrame,
    projectConstraints.length > 0 ? `Ограничения: ${projectConstraints.join('; ')}` : '',
    projectCriteria.length > 0 ? `Критерии успеха: ${projectCriteria.join('; ')}` : '',
    '',
    `--- Гипотеза для проверки ---`,
    `Название: ${hypothesis.title}`,
    '',
    `Описание:`,
    hypothesis.description,
    '',
    hypothesis.metrics
      ? `Самооценка модели: Новизна ${hypothesis.metrics.novelty}/10 · Сила ${hypothesis.metrics.strength}/10 · Реализация ${hypothesis.metrics.feasibility}/10 · Проверяемость ${hypothesis.metrics.testability}/10`
      : '',
    hypothesis.analysis ? `Анализ метрик: ${hypothesis.analysis}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ancestorsBlock = ancestorCards.length > 0
    ? `\n\n--- Контекст из предыдущих этапов (родительские карточки) ---\n` +
      ancestorCards.map((c) => `[${c.stageId} #${c.number}] ${c.title}\n${c.description}`).join('\n\n')
    : '';

  const userPrompt = `${contextBlock}${ancestorsBlock}

--- Задача ---

Составь **дешёвый и быстрый план валидации** именно ЭТОЙ гипотезы. Структура:

1. **Что именно проверяем** — одна конкретная вещь которую тест должен подтвердить/опровергнуть
2. **Как** — конкретный метод (интервью N человек / лендинг + платный трафик / fake-door кнопка / Wizard of Oz — когда вручную имитируем продукт / опрос / прототип на бумаге)
3. **Что измеряем** — конкретные метрики (число заявок, кликов, конверсия в %, готовность платить)
4. **Какая цифра подтвердит** — конкретное число "сработало" (например: ≥15% кликнули, ≥3 заявки за неделю)
5. **Какая цифра опровергнет** — конкретное число "не сработало"
6. **Бюджет** — в долларах
7. **Срок** — в днях/неделях
8. **Что делать дальше:** если подтвердилось → следующий шаг; если опроверглось → стоит ли пересмотреть гипотезу или выбросить

Если гипотеза radical (категориально новая) — раздели на ДВА теста: (a) понимают ли люди концепт вообще, (b) купят ли. Не путай.

Если можно — предложи 2-3 АЛЬТЕРНАТИВНЫХ плана теста (одна гипотеза — несколько способов проверки на разной глубине: bare minimum / нормальный / тщательный). С указанием trade-off между ними по цене/времени/уверенности.

Финальная строка: грубая оценка "вероятность что гипотеза подтвердится" — 0-10. Это не предсказание, а калибровка ожиданий.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Streaming генерация плана валидации для одной гипотезы.
 * onDelta — частичные текстовые дельты (для живого вывода в UI).
 * Возвращает финальный { fullText, tokensIn, tokensOut }.
 *
 * Стоимость: ~$0.05-0.15 за вызов (зависит от модели и длины гипотезы).
 * Это в 5-10× дешевле чем старый 4.6 Validation который генерил планы
 * для всех 5-7 шортлист-гипотез сразу.
 */
export async function generateValidationPlanForHypothesisStream(
  ctx: ValidationPlanContext,
  apiKey: string,
  onDelta: (chunk: string) => void,
  model = 'gpt-5.5',
  logContext?: LogContext,
  signal?: AbortSignal
): Promise<{ fullText: string; tokensIn: number; tokensOut: number }> {
  const messages = buildValidationPlanMessages(ctx);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(isReasoningModel(model) ? { max_completion_tokens: 4000 } : {}),
      ...(supportsCustomTemperature(model) ? { temperature: 0.5 } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `OpenAI error ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let fullText = '';
  let usageIn = 0;
  let usageOut = 0;
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const sseLines = sseBuffer.split('\n');
    sseBuffer = sseLines.pop() ?? '';

    for (const sseLine of sseLines) {
      if (!sseLine.startsWith('data: ')) continue;
      const data = sseLine.slice(6).trim();
      if (data === '[DONE]') { streamDone = true; break; }

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
        if (chunk.usage) {
          usageIn = chunk.usage.prompt_tokens ?? 0;
          usageOut = chunk.usage.completion_tokens ?? 0;
        }
      } catch { /* malformed SSE chunk */ }
    }
  }

  // Fallback если usage не пришёл
  if (usageIn === 0) {
    const promptLen = messages.reduce((s, m) => s + m.content.length, 0);
    usageIn = Math.ceil(promptLen / 2.5);
  }
  if (usageOut === 0) usageOut = Math.ceil(fullText.length / 2.5);

  if (logContext) {
    appendCostEntry({
      ...logContext,
      stageLabel: `${logContext.stageLabel} (план валидации)`,
      model,
      inputTokens: usageIn,
      outputTokens: usageOut,
    });
  }

  return { fullText, tokensIn: usageIn, tokensOut: usageOut };
}

