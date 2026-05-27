import type { StageId, CardType, MethodologyMode } from './types';

/** Модуль = группа под-модулей в левой колонке. */
export interface ModuleConfig {
  id: string;
  label: string;
  /** Цветовой акцент для модуля (используется в StagesColumn для группировки). */
  bg: string;
  text: string;
}

export const MODULES: ModuleConfig[] = [
  { id: 'reality_mapping',    label: '01. Entity / Reality Mapping', bg: 'bg-blue-50',    text: 'text-blue-800'    },
  { id: 'feature_challenge',  label: '02. Feature Challenge',        bg: 'bg-violet-50',  text: 'text-violet-800'  },
  { id: 'friction_opportunity', label: '03. Diagnosis',                bg: 'bg-orange-50',  text: 'text-orange-800'  },
  { id: 'synthesis',          label: '04. Synthesis',                bg: 'bg-emerald-50', text: 'text-emerald-800' },
];

export interface StageConfig {
  id: StageId;
  label: string;
  expectedCardType: CardType;
  order: number;
  /** К какому модулю относится. Группировка в левой колонке. */
  moduleId: string;
  /** Под-модуль использует web search вместо обычной генерации. */
  usesWebSearch?: boolean;
  /**
   * Видимость стейджа по версии методологии. Если не указано — стейдж виден во ВСЕХ версиях.
   * Используется чтобы скрывать v2-only стейджи (creative_exploration) в v1-проектах
   * и наоборот скрывать v1-only стейджи (feature_challenge, obligatory_reframing) в v2-проектах
   * — но только в auto-all и левой колонке. Legacy-карточки остаются в проекте.
   */
  availableInModes?: MethodologyMode[];
  /** Цветовая палитра. */
  bg: string;
  border: string;
  text: string;
}

export const STAGES: StageConfig[] = [
  // ───────── Module 01: Entity / Reality Mapping (9 sub-modules) ─────────
  { id: 'observation_scan',        label: '1.1 Observation Scan',         expectedCardType: 'observation_item',  order: 1,  moduleId: 'reality_mapping', bg: 'bg-slate-50',  border: 'border-slate-400',  text: 'text-slate-700'  },
  { id: 'search_scan',             label: '1.2 Search Scan',              expectedCardType: 'search_finding',    order: 2,  moduleId: 'reality_mapping', bg: 'bg-cyan-50',   border: 'border-cyan-400',   text: 'text-cyan-700',  usesWebSearch: true },
  { id: 'fundamental_dimensions',  label: '1.3 Fundamental Dimensions',   expectedCardType: 'dimension',         order: 3,  moduleId: 'reality_mapping', bg: 'bg-blue-50',   border: 'border-blue-400',   text: 'text-blue-700'   },
  { id: 'obligatory_vs_accidental',label: '1.4 Obligatory vs Accidental', expectedCardType: 'obligatory_feature',order: 4,  moduleId: 'reality_mapping', bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-700' },
  { id: 'jobs_to_be_done',         label: '1.5 Jobs-to-be-done',          expectedCardType: 'job',               order: 5,  moduleId: 'reality_mapping', bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700' },
  { id: 'users_actors',            label: '1.6 Users / Actors',           expectedCardType: 'actor',             order: 6,  moduleId: 'reality_mapping', bg: 'bg-fuchsia-50',border: 'border-fuchsia-400',text: 'text-fuchsia-700'},
  { id: 'substitutes',             label: '1.7 Substitutes',              expectedCardType: 'substitute',        order: 7,  moduleId: 'reality_mapping', bg: 'bg-amber-50',  border: 'border-amber-400',  text: 'text-amber-700'  },
  { id: 'boundary_cases',          label: '1.8 Boundary Cases',           expectedCardType: 'boundary_case',     order: 8,  moduleId: 'reality_mapping', bg: 'bg-teal-50',   border: 'border-teal-400',   text: 'text-teal-700'   },

  // ───────── Module 02: Feature Challenge ─────────
  // v1: два стейджа (2.1 Feature Challenge + 2.2 Obligatory Reframing)
  // v2: один стейдж (2.1 Creative Exploration с игровыми линзами и радикал-линзой внутри)
  { id: 'feature_challenge',       label: '2.1 Feature Challenge (Variants)',     expectedCardType: 'transformation_handle', order: 9,  moduleId: 'feature_challenge', availableInModes: ['functional_v1'], bg: 'bg-violet-50',  border: 'border-violet-400', text: 'text-violet-700' },
  { id: 'obligatory_reframing',    label: '2.2 Obligatory Reframing (Radical)',   expectedCardType: 'radical_reframe',       order: 10, moduleId: 'feature_challenge', availableInModes: ['functional_v1'], bg: 'bg-purple-50',  border: 'border-purple-500', text: 'text-purple-800' },
  { id: 'creative_exploration',    label: '2.1 Creative Exploration',             expectedCardType: 'creative_idea',         order: 9,  moduleId: 'feature_challenge', availableInModes: ['functional_v2', 'creative'], bg: 'bg-violet-50',  border: 'border-violet-400', text: 'text-violet-700' },

  // ───────── Module 03: Diagnosis (2 sub-modules) ─────────
  { id: 'friction',                label: '3.1 Карта трений',             expectedCardType: 'friction_point',      order: 11, moduleId: 'friction_opportunity', bg: 'bg-orange-50',  border: 'border-orange-400', text: 'text-orange-700' },
  { id: 'contradiction',           label: '3.2 Поиск противоречий',       expectedCardType: 'contradiction',       order: 12, moduleId: 'friction_opportunity', bg: 'bg-rose-50',    border: 'border-rose-400',   text: 'text-rose-700'   },

  // ───────── Module 04: Synthesis (5 sub-modules — 4.6 Validation удалён 2026-05-26) ─────────
  { id: 'cross_field',             label: '4.1 Кросс-доменный перенос',   expectedCardType: 'cross_field_analogy', order: 13, moduleId: 'synthesis', bg: 'bg-emerald-50', border: 'border-emerald-400',text: 'text-emerald-700'},
  { id: 'opportunity',             label: '4.2 Дерево возможностей',      expectedCardType: 'opportunity_branch',  order: 14, moduleId: 'synthesis', bg: 'bg-teal-50',    border: 'border-teal-400',   text: 'text-teal-700'   },
  { id: 'hypothesis',              label: '4.3 Генерация гипотез',        expectedCardType: 'hypothesis',          order: 15, moduleId: 'synthesis', bg: 'bg-indigo-50',  border: 'border-indigo-400', text: 'text-indigo-700' },
  { id: 'critic',                  label: '4.4 Критический разбор',       expectedCardType: 'critique',            order: 16, moduleId: 'synthesis', bg: 'bg-amber-50',   border: 'border-amber-400',  text: 'text-amber-700'  },
  { id: 'shortlist',               label: '4.5 Шортлист',                 expectedCardType: 'hypothesis',          order: 17, moduleId: 'synthesis', bg: 'bg-lime-50',    border: 'border-lime-400',   text: 'text-lime-700'   },
  // ВАЖНО: stage 'validation' удалён из активной методологии 2026-05-26.
  // Вместо него — кнопка "🧪 План валидации" на карточках гипотез/шортлиста (см. CardDetail.tsx).
  // StageId 'validation' и CardType 'validation_test' оставлены в types.ts для legacy-данных:
  // старые validation-карточки продолжают видны в проекте, просто без активного стейджа в левой колонке.
];

/** Первый stage первого модуля — куда переключаемся при миграции/новом проекте. */
export const FIRST_STAGE_ID: StageId = 'observation_scan';

/**
 * Возвращает список стейджей видимых в данной версии методологии.
 * Стейджи без явного availableInModes видны во ВСЕХ режимах.
 * Сортировка по order сохраняется.
 *
 * Использовать в:
 * - StagesColumn (левая колонка — какие стейджи показывать)
 * - Workbench.handleAutoGenerateAll (по каким итерироваться)
 */
export function getStagesForMode(mode: MethodologyMode): StageConfig[] {
  return STAGES.filter((s) => !s.availableInModes || s.availableInModes.includes(mode));
}
