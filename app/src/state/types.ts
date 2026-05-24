export type StageId =
  | 'observation' | 'search_plan' | 'search_notes' | 'reality_summary'
  | 'entity_mapping' | 'feature_challenge'
  | 'friction' | 'contradiction'
  | 'cross_field' | 'opportunity' | 'hypothesis' | 'critic'
  | 'shortlist' | 'validation'
  // legacy (old projects):
  | 'definition' | 'invert';

export type CardType =
  | 'observation_item' | 'search_task' | 'evidence_item' | 'reality_map_summary'
  | 'entity_dimension' | 'transformation_handle'
  | 'friction_point' | 'contradiction' | 'cross_field_analogy'
  | 'opportunity_branch' | 'hypothesis' | 'critique' | 'validation_test'
  // legacy:
  | 'definition_element' | 'assumption' | 'inverted_assumption';

export type CardStatus = 'neutral' | 'interesting' | 'discarded';

export type CardConfidence = 'assumed' | 'user_provided' | 'observed' | 'evidence_supported';

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
  confidence?: CardConfidence;
  notes?: string;
  derivedFromIds?: string[];
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
