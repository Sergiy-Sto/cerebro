export type StageId =
  // — Module 01: Entity / Reality Mapping (9 sub-modules) —
  | 'observation_scan'
  | 'search_scan'
  | 'fundamental_dimensions'
  | 'obligatory_vs_accidental'
  | 'jobs_to_be_done'
  | 'users_actors'
  | 'failure_modes'
  | 'substitutes'
  | 'boundary_cases'
  // — Module 02: Feature Challenge (2 sub-modules) —
  | 'feature_challenge'        // 2.1 — атака случайных признаков (variants)
  | 'obligatory_reframing'     // 2.2 — радикальное переопределение через обязательные признаки
  // — Module 03+: остальные (переработаются позже) —
  | 'friction' | 'contradiction'
  | 'cross_field' | 'opportunity' | 'hypothesis' | 'critic'
  | 'shortlist' | 'validation';

export type CardType =
  | 'observation_item' | 'search_finding'
  | 'dimension' | 'obligatory_feature' | 'accidental_feature'
  | 'job' | 'actor' | 'failure_mode' | 'substitute' | 'boundary_case'
  | 'transformation_handle' | 'radical_reframe'
  | 'friction_point' | 'contradiction' | 'cross_field_analogy'
  | 'opportunity_branch' | 'hypothesis' | 'critique' | 'validation_test';

export type CardStatus = 'neutral' | 'interesting' | 'discarded';

/**
 * Уровни уверенности для карточки или пунктов в ней.
 * - assumed: общая прикидка модели (Observation Scan и др.)
 * - user_provided: добавлено пользователем вручную
 * - observed: подтверждено внутренней логикой модели (типовой паттерн)
 * - search_snippet_supported: подкреплено поисковыми сниппетами (НЕ deep evidence)
 * - evidence_supported: подкреплено реальным контентом сайта (после "Углубиться")
 */
export type CardConfidence =
  | 'assumed'
  | 'user_provided'
  | 'observed'
  | 'search_snippet_supported'
  | 'evidence_supported';

export interface CardMetrics {
  novelty: number;
  strength: number;
  feasibility: number;
  testability: number;
}

export interface CardSource {
  title: string;
  url: string;
}

/** Один обмен Q&A в чате о карточке. */
export interface CardDiscussion {
  q: string;
  a: string;
  timestamp: string;       // ISO
  model?: string;          // какая модель отвечала
  tokensIn?: number;
  tokensOut?: number;
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
  sources?: CardSource[];  // для карточек Search Scan — список найденных источников
  discussions?: CardDiscussion[];  // история вопросов-ответов пользователя по этой карточке
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
