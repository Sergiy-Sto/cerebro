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
  logContext?: LogContext
): Promise<void> {
  const prompt = buildPrompt(stageId, project, contextCards, existingCards);
  let usagePromptTokens = 0;
  let usageCompletionTokens = 0;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert business strategist. Output ONLY raw JSON objects, one per line, no other text, no markdown. Always respond in Russian language — all titles, descriptions, and tags must be in Russian.',
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const sseLines = sseBuffer.split('\n');
    sseBuffer = sseLines.pop() ?? '';

    for (const sseLine of sseLines) {
      if (!sseLine.startsWith('data: ')) continue;
      const data = sseLine.slice(6).trim();
      if (data === '[DONE]') { flushAll(); return; }

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          contentBuffer += delta;
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

  // Лог в cost log
  if (logContext && (usagePromptTokens > 0 || usageCompletionTokens > 0)) {
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
  logContext?: LogContext
): Promise<void> {
  const prompt = buildPrompt(stageId, project, contextCards, existingCards);
  let usageInput = 0;
  let usageOutput = 0;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'You are an expert business strategist with web search. Use the web_search tool for up to 12 search queries to enrich the reality map. Output ONLY raw JSON objects, one per line — each JSON object on its own line, no other text, no markdown. Always respond in Russian language.',
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

