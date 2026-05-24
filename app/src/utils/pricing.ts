/**
 * OpenAI pricing — за 1M токенов в USD.
 * Source: platform.openai.com/docs/pricing (2026).
 * Обновлять при изменении цен.
 *
 * Если модель не найдена в таблице — используется fallback оценка
 * (input $2, output $10) чтобы стоимость хотя бы примерно считалась.
 */

export interface ModelPricing {
  input: number;
  output: number;
  /** Цена кешированных input токенов (если поддерживается prompt caching). */
  cachedInput?: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'gpt-5.5':           { input: 1.50,  output: 10.00, cachedInput: 0.375 },
  'gpt-5.4-thinking':  { input: 5.00,  output: 20.00 },
  'gpt-5.4-pro':       { input: 15.00, output: 60.00 },
  'gpt-5.4':           { input: 2.50,  output: 10.00 },
  'gpt-5.4-mini':      { input: 0.25,  output: 1.00 },
  'gpt-4.1':           { input: 3.00,  output: 12.00 },
};

/** Web search tool (внутри Responses API). */
export const WEB_SEARCH = {
  /** $10 за 1000 поисков → $0.01 за поиск. */
  perCall: 0.01,
};

const FALLBACK: ModelPricing = { input: 2.00, output: 10.00 };

export function getPricing(model: string): ModelPricing {
  return PRICING[model] ?? FALLBACK;
}

/**
 * Грубая оценка стоимости запроса в USD.
 * webSearchCalls — количество вызовов web_search tool за запрос.
 * Search content tokens обычно уже включены OpenAI в inputTokens, поэтому
 * отдельно не считаем — только per-call плату.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearchCalls = 0
): number {
  const p = getPricing(model);
  let cost =
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output;
  cost += webSearchCalls * WEB_SEARCH.perCall;
  return cost;
}
