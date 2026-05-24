export type StageId =
  | 'definition' | 'invert' | 'friction' | 'contradiction'
  | 'cross_field' | 'opportunity' | 'hypothesis' | 'critic'
  | 'shortlist' | 'validation';

export type CardType =
  | 'definition_element' | 'assumption' | 'inverted_assumption'
  | 'friction_point' | 'contradiction' | 'cross_field_analogy'
  | 'opportunity_branch' | 'hypothesis' | 'critique' | 'validation_test';

export type CardStatus = 'neutral' | 'interesting' | 'discarded';

export interface CardMetrics {
  novelty: number;
  strength: number;
  feasibility: number;
  testability: number;
}

export interface Card {
  id: string;
  number: number;
  stageId: StageId;
  type: CardType;
  title: string;
  description: string;
  tags: string[];
  status: CardStatus;
  parentId: string | null;
  createdAt: string;
  metrics?: CardMetrics;
  analysis?: string;
  model?: string;
}

export interface Project {
  id: string;
  title: string;
  frame: string;
  constraints: string[];
  criteria: string[];
  cards: Card[];
  activeStageId: StageId;
  selectedCardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
}
