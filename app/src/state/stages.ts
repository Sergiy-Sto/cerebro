import type { StageId, CardType } from './types';

export interface StageConfig {
  id: StageId;
  label: string;
  expectedCardType: CardType;
  order: number;
  bg: string;
  border: string;
  text: string;
}

export const STAGES: StageConfig[] = [
  { id: 'definition',   label: 'Деконструкция определения', expectedCardType: 'definition_element',  order: 1,  bg: 'bg-blue-50',    border: 'border-blue-400',   text: 'text-blue-700'   },
  { id: 'invert',       label: 'Инверсия допущений',        expectedCardType: 'inverted_assumption', order: 2,  bg: 'bg-violet-50',  border: 'border-violet-400', text: 'text-violet-700' },
  { id: 'friction',     label: 'Карта трений',              expectedCardType: 'friction_point',      order: 3,  bg: 'bg-orange-50',  border: 'border-orange-400', text: 'text-orange-700' },
  { id: 'contradiction',label: 'Поиск противоречий',        expectedCardType: 'contradiction',       order: 4,  bg: 'bg-rose-50',    border: 'border-rose-400',   text: 'text-rose-700'   },
  { id: 'cross_field',  label: 'Кросс-доменный перенос',   expectedCardType: 'cross_field_analogy', order: 5,  bg: 'bg-emerald-50', border: 'border-emerald-400',text: 'text-emerald-700'},
  { id: 'opportunity',  label: 'Дерево возможностей',       expectedCardType: 'opportunity_branch',  order: 6,  bg: 'bg-teal-50',    border: 'border-teal-400',   text: 'text-teal-700'   },
  { id: 'hypothesis',   label: 'Генерация гипотез',         expectedCardType: 'hypothesis',          order: 7,  bg: 'bg-indigo-50',  border: 'border-indigo-400', text: 'text-indigo-700' },
  { id: 'critic',       label: 'Критический разбор',        expectedCardType: 'critique',            order: 8,  bg: 'bg-amber-50',   border: 'border-amber-400',  text: 'text-amber-700'  },
  { id: 'shortlist',    label: 'Шортлист',                  expectedCardType: 'hypothesis',          order: 9,  bg: 'bg-lime-50',    border: 'border-lime-400',   text: 'text-lime-700'   },
  { id: 'validation',   label: 'План валидации',            expectedCardType: 'validation_test',     order: 10, bg: 'bg-sky-50',     border: 'border-sky-400',    text: 'text-sky-700'    },
];
