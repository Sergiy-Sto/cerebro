/**
 * Cost log — журнал каждого API-вызова с usage и расчёт стоимости.
 * Хранится в localStorage. Помогает понять "не приложение дорогое,
 * а Hypothesis + Critic + Search жрут 70%".
 */

import { estimateCost } from './pricing';

const STORAGE_KEY = 'cerebro_cost_log_v1';
const MAX_ENTRIES = 1000;

export interface CostEntry {
  timestamp: string;          // ISO
  projectId: string | null;
  projectTitle: string | null;
  stageId: string | null;
  stageLabel: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  /**
   * Legacy: ранее сюда писали статичную оценку на момент записи.
   * Больше не читаем — стоимость пересчитывается на лету через entryCost()
   * чтобы изменения цен в pricing.ts автоматически отражались
   * на исторических записях. Поле сохранено как optional для совместимости
   * со старыми localStorage-данными (просто игнорируется).
   */
  cost?: number;
}

/**
 * Динамический пересчёт стоимости одной записи лога по актуальному прайсу.
 * Это единственный источник правды для отображения стоимости —
 * `entry.cost` (если есть) игнорируется.
 */
export function entryCost(entry: CostEntry): number {
  return estimateCost(
    entry.model,
    entry.inputTokens,
    entry.outputTokens,
    entry.webSearchCalls ?? 0
  );
}

export interface CostLogInput {
  projectId?: string | null;
  projectTitle?: string | null;
  stageId?: string | null;
  stageLabel?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls?: number;
}

export function loadCostLog(): CostEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CostEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendCostEntry(input: CostLogInput): CostEntry {
  const entry: CostEntry = {
    timestamp: new Date().toISOString(),
    projectId: input.projectId ?? null,
    projectTitle: input.projectTitle ?? null,
    stageId: input.stageId ?? null,
    stageLabel: input.stageLabel ?? null,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    webSearchCalls: input.webSearchCalls ?? 0,
    // cost не записываем — теперь пересчитывается на лету через entryCost()
  };

  const log = loadCostLog();
  log.push(entry);
  const capped = log.slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
    // Уведомить слушателей (header badge), чтобы перерисовался
    window.dispatchEvent(new CustomEvent('cerebro:cost-log-updated'));
  } catch {
    /* ignore quota errors */
  }
  return entry;
}

export function clearCostLog(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('cerebro:cost-log-updated'));
}

export function totalCostToday(): number {
  const log = loadCostLog();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return log
    .filter((e) => new Date(e.timestamp) >= todayStart)
    .reduce((sum, e) => sum + entryCost(e), 0);
}

export function totalCostAll(): number {
  return loadCostLog().reduce((sum, e) => sum + entryCost(e), 0);
}

export interface CostBreakdown {
  key: string;
  cost: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}

/** Группировка трат за заданный период по стейджам или моделям. */
export function breakdown(
  by: 'stage' | 'model' | 'project',
  filter?: { since?: Date }
): CostBreakdown[] {
  const log = loadCostLog().filter((e) =>
    filter?.since ? new Date(e.timestamp) >= filter.since : true
  );

  const map = new Map<string, CostBreakdown>();
  for (const e of log) {
    let key: string;
    if (by === 'stage') key = e.stageLabel ?? e.stageId ?? '(нет стейджа)';
    else if (by === 'model') key = e.model;
    else key = e.projectTitle ?? e.projectId ?? '(нет проекта)';

    const cur = map.get(key) ?? {
      key,
      cost: 0,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      webSearchCalls: 0,
    };
    cur.cost += entryCost(e);
    cur.calls += 1;
    cur.inputTokens += e.inputTokens;
    cur.outputTokens += e.outputTokens;
    cur.webSearchCalls += e.webSearchCalls;
    map.set(key, cur);
  }

  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}
