import type { StageId, Project, Card } from '../state/types';
import { buildPrompt } from './prompts';

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

export async function generateSearchQueries(
  project: Project,
  observationCards: Card[],
  apiKey: string,
  model = 'gpt-5.5'
): Promise<string[]> {
  const cardsText = observationCards.map(c => `- ${c.title}: ${c.description}`).join('\n');

  const prompt = `Тема: ${project.frame}

Карточки Observation Scan:
${cardsText}

Сгенерируй 6-8 коротких поисковых запросов в Google для расширения и проверки этой карты реальности.

Покрой направления:
- конкретные типы и разновидности темы
- реальные проблемы пользователей (Reddit, форумы, отзывы)
- существующие приложения, сервисы, конкуренты в этой нише
- жалобы и критика существующих решений
- заменители и обходные пути
- межъязыковые варианты если уместно

Запросы должны быть:
- короткими (3-7 слов)
- конкретными — не "renovation" а "renovation budget overrun reddit"
- на английском (лучший охват в Google)
- готовыми к вставке в Google как есть

ВАЖНО: Верни ТОЛЬКО валидный JSON-объект, без markdown, без префикса:
{"queries": ["query 1", "query 2", "query 3", ...]}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      ...(isReasoningModel(model) ? { max_completion_tokens: 1500 } : {}),
      ...(supportsCustomTemperature(model) ? { temperature: 0.7 } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `OpenAI error ${response.status}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content) as { queries?: unknown };
    if (Array.isArray(parsed.queries)) {
      return parsed.queries.map(String).filter(Boolean);
    }
  } catch { /* fall through */ }
  return [];
}

export async function generateCardsStream(
  stageId: StageId,
  project: Project,
  apiKey: string,
  contextCards: Card[],
  existingCards: Card[] = [],
  onCard: (card: GeneratedCard) => void,
  model = 'gpt-5.5'
): Promise<void> {
  const prompt = buildPrompt(stageId, project, contextCards, existingCards);

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
        const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          contentBuffer += delta;
          flushLines();
        }
      } catch { /* malformed SSE chunk */ }
    }
  }

  flushAll();
}
