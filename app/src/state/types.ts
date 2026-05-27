export type StageId =
  // — Module 01: Entity / Reality Mapping (8 sub-modules) —
  | 'observation_scan'
  | 'search_scan'
  | 'fundamental_dimensions'
  | 'obligatory_vs_accidental'
  | 'jobs_to_be_done'
  | 'users_actors'
  | 'substitutes'
  | 'boundary_cases'
  // — Module 02: Feature Challenge —
  | 'feature_challenge'        // v1: 2.1 атака случайных признаков (variants). В v2 НЕ в auto-all, только manual.
  | 'obligatory_reframing'     // v1: 2.2 радикальное переопределение. В v2 НЕ в auto-all, только manual.
  | 'creative_exploration'     // v2 only: 2.1 игровая разведка со всеми кирпичиками (вместо v1 2.1+2.2)
  // — Module 03+ —
  | 'friction' | 'contradiction'
  | 'cross_field' | 'opportunity' | 'hypothesis' | 'critic'
  | 'shortlist' | 'validation';

/**
 * Версия методологии (выбирается при создании проекта).
 *
 * - functional_v1: исходный жёсткий функциональный режим. Pain-frame первичен.
 *   Module 02: 2.1 Feature Challenge + 2.2 Obligatory Reframing.
 *   Required-структуры полей, конкретные функциональные слова (смета, доплата),
 *   pain-driven lens во всех стейджах.
 *   Для старых проектов созданных до 2026-05-28.
 *
 * - functional_v2: smooth, opportunity-first. POLARITY FLIP — смотрим из будущего.
 *   Module 02: один стейдж 2.1 Creative Exploration (игровая разведка с радикал-линзой).
 *   Softened structures (ориентиры вместо required), без функционал-специфичных слов,
 *   opportunity-frame во всех стейджах.
 *   Default для новых проектов.
 *
 * - creative: будущий креативный режим (отдельный pipeline, в работе).
 *   Magnet / aesthetic / ritual / identity вместо аналитики болей.
 */
export type MethodologyMode = 'functional_v1' | 'functional_v2' | 'creative';

export type CardType =
  | 'observation_item' | 'search_finding'
  | 'dimension' | 'obligatory_feature' | 'accidental_feature'
  | 'job' | 'actor' | 'substitute' | 'boundary_case'
  | 'transformation_handle' | 'radical_reframe'
  | 'creative_idea'  // для v2 stage 2.1 Creative Exploration
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
  /**
   * Версия методологии (выбирается при создании проекта).
   * Optional для legacy данных — migration выставляет 'functional_v1' старым проектам.
   * См. MethodologyMode выше для деталей.
   */
  methodologyMode?: MethodologyMode;
}

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
}
