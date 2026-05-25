/**
 * OpenAI pricing — за 1M токенов в USD.
 * Source: platform.openai.com/docs/pricing (проверено через WebSearch 2026-05-26).
 * Обновлять при изменении цен — у OpenAI они меняются регулярно.
 *
 * Cached input = 10% от обычной input цены (новый дефолт для gpt-5.x семейства).
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
  // GPT-5.5 семейство
  'gpt-5.5':           { input: 5.00,  output: 30.00,  cachedInput: 0.50 },
  'gpt-5.5-pro':       { input: 30.00, output: 180.00, cachedInput: 3.00 },

  // GPT-5.4 семейство
  'gpt-5.4-thinking':  { input: 5.00,  output: 30.00,  cachedInput: 0.50 },
  'gpt-5.4-pro':       { input: 15.00, output: 60.00,  cachedInput: 1.50 },
  'gpt-5.4':           { input: 2.50,  output: 15.00,  cachedInput: 0.25 },
  'gpt-5.4-mini':      { input: 0.75,  output: 4.50,   cachedInput: 0.075 },
  'gpt-5.4-nano':      { input: 0.20,  output: 1.25,   cachedInput: 0.02 },

  // GPT-4.1 семейство (legacy)
  'gpt-4.1':           { input: 2.00,  output: 8.00 },
  'gpt-4.1-mini':      { input: 0.40,  output: 1.60 },
  'gpt-4.1-nano':      { input: 0.10,  output: 0.40 },
};

/**
 * Web search tool (внутри Responses API).
 * - Per-call: $10 за 1000 поисков → $0.01 за поиск
 * - Content tokens: ~8K input tokens на каждый поиск, биллятся по input rate модели.
 *   Эти content tokens обычно УЖЕ включены OpenAI в usage.input_tokens когда usage
 *   возвращается. Но в fallback оценке мы их теряем — поэтому добавляем поправку.
 */
export const WEB_SEARCH = {
  perCall: 0.01,
  contentTokensPerCall: 8000,
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
