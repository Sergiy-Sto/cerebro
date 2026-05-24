import type { StageId, CardType } from './types';

export interface StageConfig {
  id: StageId;
  label: string;
  expectedCardType: CardType;
  order: number;
  bg: string;
  border: string;
  text: string;
  /** true = user fills cards manually, model does not generate */
  userInput?: boolean;
}

export const STAGES: StageConfig[] = [
  // — Reality Mapping —
  { id: 'observation',       label: 'Observation Scan',            expectedCardType: 'observation_item',     order: 1,  bg: 'bg-slate-50',   border: 'border-slate-400',  text: 'text-slate-700'  },
  { id: 'search_notes',      label: 'Search Notes (ручной ввод)',  expectedCardType: 'evidence_item',        order: 2,  bg: 'bg-zinc-50',    border: 'border-zinc-400',   text: 'text-zinc-700',  userInput: true },
  { id: 'reality_summary',   label: 'Reality Map Summary',         expectedCardType: 'reality_map_summary',  order: 3,  bg: 'bg-cyan-50',    border: 'border-cyan-400',   text: 'text-cyan-700'   },
  // — Deep analysis —
  { id: 'entity_mapping',    label: 'Entity Mapping',              expectedCardType: 'entity_dimension',     order: 4,  bg: 'bg-blue-50',    border: 'border-blue-400',   text: 'text-blue-700'   },
  { id: 'feature_challenge', label: 'Feature Challenge',           expectedCardType: 'transformation_handle',order: 5,  bg: 'bg-violet-50',  border: 'border-violet-400', text: 'text-violet-700' },
  // — Friction & opportunity —
  { id: 'friction',          label: 'Карта трений',                expectedCardType: 'friction_point',       order: 6,  bg: 'bg-orange-50',  border: 'border-orange-400', text: 'text-orange-700' },
  { id: 'contradiction',     label: 'Поиск противоречий',          expectedCardType: 'contradiction',        order: 7,  bg: 'bg-rose-50',    border: 'border-rose-400',   text: 'text-rose-700'   },
  { id: 'cross_field',       label: 'Кросс-доменный перенос',      expectedCardType: 'cross_field_analogy',  order: 8,  bg: 'bg-emerald-50', border: 'border-emerald-400',text: 'text-emerald-700'},
  { id: 'opportunity',       label: 'Дерево возможностей',         expectedCardType: 'opportunity_branch',   order: 9,  bg: 'bg-teal-50',    border: 'border-teal-400',   text: 'text-teal-700'   },
  // — Synthesis —
  { id: 'hypothesis',        label: 'Генерация гипотез',           expectedCardType: 'hypothesis',           order: 10, bg: 'bg-indigo-50',  border: 'border-indigo-400', text: 'text-indigo-700' },
  { id: 'critic',            label: 'Критический разбор',          expectedCardType: 'critique',             order: 11, bg: 'bg-amber-50',   border: 'border-amber-400',  text: 'text-amber-700'  },
  { id: 'shortlist',         label: 'Шортлист',                    expectedCardType: 'hypothesis',           order: 12, bg: 'bg-lime-50',    border: 'border-lime-400',   text: 'text-lime-700'   },
  { id: 'validation',        label: 'План валидации',              expectedCardType: 'validation_test',      order: 13, bg: 'bg-sky-50',     border: 'border-sky-400',    text: 'text-sky-700'    },
  // — Legacy (для старых проектов чтобы не падало; в auto-all не участвуют) —
  { id: 'definition',        label: '[legacy] Деконструкция',      expectedCardType: 'definition_element',   order: 100, bg: 'bg-gray-50',  border: 'border-gray-300',   text: 'text-gray-500',  userInput: true },
  { id: 'invert',            label: '[legacy] Инверсия',           expectedCardType: 'inverted_assumption',  order: 101, bg: 'bg-gray-50',  border: 'border-gray-300',   text: 'text-gray-500',  userInput: true },
  { id: 'search_plan',       label: '[legacy] Search Plan',        expectedCardType: 'search_task',          order: 102, bg: 'bg-gray-50',  border: 'border-gray-300',   text: 'text-gray-500',  userInput: true },
];
