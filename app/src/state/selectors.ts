import type { AppState, Card, Project, StageId } from './types';
import { STAGES } from './stages';

/**
 * Правила исключения целых модулей из контекста для late-stage этапов.
 * Для каждого stageId — список moduleId которые НЕ нужно передавать в промпт.
 *
 * Логика: late-stage этапы работают с результатами синтеза предыдущих,
 * сырые данные из Reality Mapping и Feature Challenge им уже не нужны.
 * Это даёт экономию (меньше input tokens) + фокус модели.
 *
 * Для 4.1 Hypothesis — НЕ исключаем ничего: это главный этап, риск потери качества высок.
 */
const STAGE_CONTEXT_EXCLUDED_MODULES: Partial<Record<StageId, string[]>> = {
  // 4.4 Critic — нужны 4.3 (гипотезы которые критикуем) + Module 03 Diagnosis + 4.1/4.2 (cross-field/opportunity)
  critic: ['reality_mapping', 'feature_challenge'],

  // 4.5 Shortlist — нужны 4.3 + 4.4 + Module 03 Diagnosis (контекст почему гипотезы вообще нужны)
  shortlist: ['reality_mapping', 'feature_challenge'],

  // ВАЖНО: 'validation' удалён из активной методологии 2026-05-26 —
  // вместо него ad-hoc кнопка "🧪 План валидации" на карточках с собственным
  // фокусным промптом в openai.ts → generateValidationPlanForHypothesis().
};

export function getActiveProject(state: AppState): Project | null {
  if (!state.activeProjectId) return null;
  return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
}

export function cardsByStage(project: Project, stageId: StageId): Card[] {
  return project.cards.filter((c) => c.stageId === stageId);
}

export interface StageStats {
  total: number;
  interesting: number;
  discarded: number;
}

export function statsForStage(project: Project, stageId: StageId): StageStats {
  const cards = cardsByStage(project, stageId);
  return {
    total: cards.length,
    interesting: cards.filter((c) => c.status === 'interesting').length,
    discarded: cards.filter((c) => c.status === 'discarded').length,
  };
}

export type StageStatus = 'done' | 'active' | 'has-cards' | 'empty';

export function stageStatus(project: Project, stageId: StageId): StageStatus {
  if (project.activeStageId === stageId) return 'active';
  const stats = statsForStage(project, stageId);
  if (stats.interesting > 0) return 'done';
  if (stats.total > 0) return 'has-cards';
  return 'empty';
}

export function getCard(project: Project, cardId: string): Card | null {
  return project.cards.find((c) => c.id === cardId) ?? null;
}

/**
 * Возвращает контекстные карточки для генерации заданного стейджа.
 * Применяет:
 * 1. Только карточки из стейджей с меньшим order (предыдущие в цепочке)
 * 2. Исключение ✗ Отклонённых (status === 'discarded')
 * 3. Per-stage исключение целых модулей (STAGE_CONTEXT_EXCLUDED_MODULES)
 *
 * Используется в Workbench (auto-all) и CardsColumn (handleGenerate).
 * Дополнительно можно передать generatedCards — карточки сгенерированные в текущем auto-all
 * run, ещё не сохранённые в project (для корректной работы цепочки).
 */
export function getContextCardsForStage(
  project: Project,
  stageId: StageId,
  generatedCards: Card[] = []
): Card[] {
  const currentStage = STAGES.find((s) => s.id === stageId);
  if (!currentStage) return [];

  const excludedModules = STAGE_CONTEXT_EXCLUDED_MODULES[stageId] ?? [];

  // Stage IDs которые мы хотим включить (по order < current + НЕ в excluded modules)
  const allowedStageIds = STAGES
    .filter((s) => s.order < currentStage.order)
    .filter((s) => !excludedModules.includes(s.moduleId ?? ''))
    .map((s) => s.id);

  // Все карточки из allowed stages + generated cards в auto-all + dedup + не discarded
  const allCards = [
    ...project.cards.filter((c) => allowedStageIds.includes(c.stageId)),
    ...generatedCards.filter((c) => allowedStageIds.includes(c.stageId)),
  ];

  return allCards
    .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx)
    .filter((c) => c.status !== 'discarded');
}

/**
 * Lineage карточки — путь через граф derivedFromIds.
 * Используется для определения "радикальности" — если в цепочке предков
 * есть карточка из 2.2 Obligatory Reframing → потомок построен на радикальном фундаменте.
 *
 * Эту метку нельзя подделать промптом — она вычисляется из графа.
 */
export interface CardLineage {
  /** Есть ли в цепочке предков карточка из 2.2 Obligatory Reframing. */
  hasRadicalAncestor: boolean;
  /** Уникальные stageId всех (транзитивных) предков. */
  ancestorStages: Set<StageId>;
  /** Глубина графа (макс. длина цепочки предков). */
  depth: number;
}

export function cardLineage(project: Project, card: Card): CardLineage {
  const visited = new Set<string>();
  const ancestorStages = new Set<StageId>();
  let hasRadical = false;
  let maxDepth = 0;

  function walk(id: string, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    const c = project.cards.find((x) => x.id === id);
    if (!c) return;
    ancestorStages.add(c.stageId);
    if (c.stageId === 'obligatory_reframing') hasRadical = true;
    if (depth > maxDepth) maxDepth = depth;
    for (const parentId of c.derivedFromIds ?? []) {
      walk(parentId, depth + 1);
    }
  }

  for (const parentId of card.derivedFromIds ?? []) {
    walk(parentId, 1);
  }

  return { hasRadicalAncestor: hasRadical, ancestorStages, depth: maxDepth };
}
