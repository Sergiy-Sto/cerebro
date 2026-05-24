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

    return {
      title,
      description: String(obj.description ?? '').trim(),
      tags: Array.isArray(obj.tags) ? (obj.tags as unknown[]).map(String) : [],
      metrics,
      analysis: obj.analysis ? String(obj.analysis).trim() : undefined,
    };
  } catch {
    return null;
  }
}

export async function generateCardsStream(
  stageId: StageId,
  project: Project,
  apiKey: string,
  contextCards: Card[],
  existingCards: Card[] = [],
  onCard: (card: GeneratedCard) => void,
  model = 'gpt-4.1'
): Promise<void> {
  const prompt = buildPrompt(stageId, project, contextCards, existingCards);
  const isReasoning = model.startsWith('o');

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
      ...(isReasoning ? { max_completion_tokens: 8000 } : { temperature: 0.85 }),
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
