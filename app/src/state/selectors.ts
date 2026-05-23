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
