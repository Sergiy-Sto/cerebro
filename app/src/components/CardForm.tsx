import { useState } from 'react';
import type { Card, CardType, StageId, Project } from '../state/types';
import { STAGES } from '../state/stages';
import { newId } from '../utils/id';

const ALL_CARD_TYPES: CardType[] = [
  'definition_element',
  'assumption',
  'inverted_assumption',
  'friction_point',
  'contradiction',
  'cross_field_analogy',
  'opportunity_branch',
  'hypothesis',
  'critique',
  'validation_test',
];

interface CardFormProps {
  card?: Card;
  parentId?: string;
  stageId: StageId;
  project: Project;
  onSave: (card: Card) => void;
  onCancel: () => void;
}

export default function CardForm({ card, parentId, stageId, project, onSave, onCancel }: CardFormProps) {
  const currentStageConfig = STAGES.find((s) => s.id === stageId)!;
  const isEdit = !!card;

  const [title, setTitle] = useState(card?.title ?? '');
  const [type, setType] = useState<CardType>(card?.type ?? currentStageConfig.expectedCardType);
  const [selectedStageId, setSelectedStageId] = useState<StageId>(card?.stageId ?? stageId);
  const [description, setDescription] = useState(card?.description ?? '');
  const [tagsInput, setTagsInput] = useState(card?.tags.join(', ') ?? '');
  const [selectedParentId, setSelectedParentId] = useState<string>(
    card?.parentId ?? parentId ?? ''
  );
  const [errors, setErrors] = useState<string[]>([]);

  // Cards from stages with order < current stage's order (for parent selection)
  const selectedStageOrder = STAGES.find((s) => s.id === selectedStageId)?.order ?? 1;
  const parentCandidates = project.cards.filter((c) => {
    const stageOrder = STAGES.find((s) => s.id === c.stageId)?.order ?? 0;
    return stageOrder < selectedStageOrder;
  });

  function validate(): boolean {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Название обязательно.');
    if (!description.trim()) errs.push('Описание обязательно.');
    setErrors(errs);
    return errs.length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const savedCard: Card = {
      id: card?.id ?? newId(),
      number: card?.number ?? 0, // caller sets number for new cards
      stageId: selectedStageId,
      type,
      title: title.trim(),
      description: description.trim(),
      tags,
      status: card?.status ?? 'neutral',
      parentId: selectedParentId || null,
      createdAt: card?.createdAt ?? new Date().toISOString(),
    };

    onSave(savedCard);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-gray-200 p-5 w-full max-w-lg overflow-y-auto max-h-screen">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {isEdit ? 'Редактировать карточку' : 'Новая карточка'}
        </h3>

        {errors.length > 0 && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 text-xs text-red-700 space-y-1">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* Title */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Название *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Название карточки"
          />
        </div>

        {/* Type */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Тип</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CardType)}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ALL_CARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Stage */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Этап</label>
          <select
            value={selectedStageId}
            onChange={(e) => {
              setSelectedStageId(e.target.value as StageId);
              setSelectedParentId(''); // reset parent when stage changes
            }}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.order}. {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Описание *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            placeholder="Описание карточки..."
          />
        </div>

        {/* Tags */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Теги (через запятую, необязательно)</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="тег1, тег2, тег3"
          />
        </div>

        {/* Parent card */}
        {parentCandidates.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs text-gray-600 mb-1">Родительская карточка (необязательно)</label>
            <select
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— нет —</option>
              {parentCandidates.map((c) => {
                const parentStage = STAGES.find((s) => s.id === c.stageId);
                return (
                  <option key={c.id} value={c.id}>
                    [{parentStage?.label ?? c.stageId} #{c.number}] {c.title}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700"
          >
            {isEdit ? 'Сохранить' : 'Добавить карточку'}
          </button>
        </div>
      </div>
    </div>
  );
}
