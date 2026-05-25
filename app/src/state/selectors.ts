import type { AppState, Card, Project, StageId } from './types';

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
