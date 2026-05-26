import { useState, type Dispatch } from 'react';
import type { Card, Project } from '../state/types';
import { STAGES } from '../state/stages';
import { getCard, cardsByStage, cardLineage } from '../state/selectors';
import type { StoreAction } from '../state/store';
import CardForm from './CardForm';
import CardDescription from './CardDescription';
import CardChatModal from './CardChatModal';
import ValidationPlanModal from './ValidationPlanModal';
import ConfirmDialog from './ConfirmDialog';

interface CardDetailProps {
  card: Card | null;
  project: Project;
  dispatch: Dispatch<StoreAction>;
  model?: string;
}

export default function CardDetail({ card, project, dispatch, model = 'gpt-5.5' }: CardDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChildForm, setShowChildForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  if (!card) {
    return (
      <div className="flex-1 bg-white border-l border-gray-200 flex items-center justify-center">
        <p className="text-sm text-gray-400">Выберите карточку</p>
      </div>
    );
  }

  const stageConfig = STAGES.find((s) => s.id === card.stageId)!;

  let parentCard: Card | null = null;
  let parentStageConfig = null;
  if (card.parentId) {
    parentCard = getCard(project, card.parentId);
    if (parentCard) {
      parentStageConfig = STAGES.find((s) => s.id === parentCard!.stageId);
    }
  }

  function handleToggleInteresting() {
    if (!card) return;
    const newStatus = card.status === 'interesting' ? 'neutral' : 'interesting';
    dispatch({
      type: 'UPDATE_CARD',
      payload: {
        projectId: project.id,
        card: { ...card, status: newStatus },
      },
    });
  }

  function handleToggleDiscard() {
    if (!card) return;
    const newStatus = card.status === 'discarded' ? 'neutral' : 'discarded';
    dispatch({
      type: 'UPDATE_CARD',
      payload: {
        projectId: project.id,
        card: { ...card, status: newStatus },
      },
    });
  }

  function handleNavigateToParent() {
    if (!parentCard) return;
    dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId: parentCard.stageId } });
    dispatch({ type: 'SET_SELECTED_CARD', payload: { cardId: parentCard.id } });
  }

  function handleDelete() {
    dispatch({
      type: 'DELETE_CARD',
      payload: { projectId: project.id, cardId: card!.id },
    });
    setShowDeleteConfirm(false);
  }

  return (
    <div className="flex-1 bg-white border-l border-gray-200 overflow-y-auto flex flex-col">
      <div className="px-5 py-4 flex-1">
        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{card.title}</h2>

        {/* Meta */}
        <div className="flex gap-2 flex-wrap items-center text-xs text-gray-400 mb-2">
          <span>{card.type.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span>{stageConfig.label}</span>
          <span>·</span>
          <span>#{card.number}</span>
          {card.model && <><span>·</span><span className="text-violet-400 font-mono">{card.model}</span></>}
          {cardLineage(project, card).hasRadicalAncestor && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 border border-purple-300 text-purple-700 text-[10px] font-medium uppercase tracking-wide"
              title="В цепочке предков (через derivedFromIds) есть карточка из 2.2 Obligatory Reframing. Эта идея построена на радикальном переопределении сущности, а не на улучшении существующего."
            >
              🔥 Radical lineage
            </span>
          )}
        </div>

        {/* Parent link */}
        {parentCard && parentStageConfig && (
          <button
            onClick={handleNavigateToParent}
            className="text-xs text-blue-600 hover:underline mb-3 block"
          >
            ↳ из {parentStageConfig.label} #{parentCard.number} — {parentCard.title}
          </button>
        )}

        {/* Description (с разметкой: bullets, headings, markers, links) */}
        <div className="mb-4">
          <CardDescription text={card.description} />
        </div>

        {/* Sources (если карточка из Search Scan) */}
        {card.sources && card.sources.length > 0 && (
          <div className="mb-4 p-3 bg-cyan-50 border border-cyan-200">
            <p className="text-xs font-semibold text-cyan-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              🌐 Источники ({card.sources.length})
              {card.confidence === 'search_snippet_supported' && (
                <span className="text-[10px] font-normal text-cyan-500 normal-case">snippets, не полный контент сайтов</span>
              )}
            </p>
            <ul className="space-y-1">
              {card.sources.map((src, i) => (
                <li key={i} className="text-xs">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-700 hover:text-cyan-900 hover:underline break-all"
                  >
                    {src.title || src.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {card.tags.map((tag) => (
              <span key={tag} className="bg-gray-100 rounded-full px-2 py-0.5 text-xs text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Metrics */}
        {card.metrics && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Оценка</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {([
                { key: 'novelty',     label: 'Новизна' },
                { key: 'strength',    label: 'Сила идеи' },
                { key: 'feasibility', label: 'Реализация' },
                { key: 'testability', label: 'Проверяемость' },
              ] as const).map(({ key, label }) => {
                const val = card.metrics![key] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">{label}</span>
                      <span className={`font-semibold ${val >= 8 ? 'text-emerald-600' : val >= 6 ? 'text-amber-600' : 'text-red-500'}`}>{val}/10</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${val >= 8 ? 'bg-emerald-400' : val >= 6 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${val * 10}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {card.analysis && (
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">{card.analysis}</p>
            )}
          </div>
        )}

        {/* Status */}
        <p className="text-xs text-gray-500 mb-4">
          Статус:{' '}
          <span
            className={
              card.status === 'interesting'
                ? 'text-amber-600 font-medium'
                : card.status === 'discarded'
                ? 'text-gray-400'
                : 'text-gray-600'
            }
          >
            {{ neutral: 'нейтрально', interesting: 'интересно', discarded: 'отклонено' }[card.status]}
          </span>
        </p>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowChat(true)}
            className="px-3 py-1.5 text-xs border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium"
            title="Задать вопрос модели об этой карточке. Модель знает контекст + родителей."
          >
            💬 Спросить
            {card.discussions && card.discussions.length > 0 && (
              <span className="ml-1.5 inline-block bg-blue-200 text-blue-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {card.discussions.length}
              </span>
            )}
          </button>

          {/* Кнопка "🧪 План валидации" — только для гипотез (4.3) и шортлист-карточек (4.5).
              Заменила старый обязательный 4.6 Validation этап (удалён 2026-05-26).
              Генерирует фокусный план валидации только для этой одной гипотезы. */}
          {card.type === 'hypothesis' && (
            <button
              onClick={() => setShowValidation(true)}
              className="px-3 py-1.5 text-xs border border-sky-400 text-sky-700 bg-sky-50 hover:bg-sky-100 font-medium"
              title="Сгенерировать дешёвый и быстрый план валидации именно для этой гипотезы. Стоит ~$0.05-0.15."
            >
              🧪 План валидации
            </button>
          )}

          <button
            onClick={handleToggleInteresting}
            className={[
              'px-3 py-1.5 text-xs border',
              card.status === 'interesting'
                ? 'bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            {card.status === 'interesting' ? '★ Убрать метку' : '★ Отметить'}
          </button>

          <button
            onClick={handleToggleDiscard}
            className={[
              'px-3 py-1.5 text-xs border',
              card.status === 'discarded'
                ? 'border-gray-400 text-gray-600 hover:bg-gray-50'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            {card.status === 'discarded' ? '↩ Восстановить' : '✗ Отклонить'}
          </button>

          <button
            onClick={() => setShowChildForm(true)}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            + Дочерняя
          </button>

          <button
            onClick={() => setShowEditForm(true)}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            ✏ Изменить
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 text-xs border border-red-300 text-red-600 hover:bg-red-50"
          >
            🗑 Удалить
          </button>
        </div>
      </div>

      {showEditForm && (
        <CardForm
          card={card}
          stageId={card.stageId}
          project={project}
          onSave={(cardData) => {
            dispatch({
              type: 'UPDATE_CARD',
              payload: {
                projectId: project.id,
                card: { ...card, ...cardData },
              },
            });
            setShowEditForm(false);
          }}
          onCancel={() => setShowEditForm(false)}
        />
      )}

      {showChildForm && (
        <CardForm
          parentId={card.id}
          stageId={project.activeStageId}
          project={project}
          onSave={(cardData) => {
            const stageCards = cardsByStage(project, cardData.stageId);
            const maxNum = stageCards.reduce((m, c) => Math.max(m, c.number), 0);
            dispatch({
              type: 'ADD_CARD',
              payload: {
                projectId: project.id,
                card: {
                  ...cardData,
                  number: maxNum + 1,
                  status: 'neutral',
                  createdAt: new Date().toISOString(),
                },
              },
            });
            setShowChildForm(false);
          }}
          onCancel={() => setShowChildForm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Удалить карточку «${card.title}»? Действие необратимо.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showChat && (
        <CardChatModal
          card={card}
          project={project}
          model={model}
          dispatch={dispatch}
          onClose={() => setShowChat(false)}
        />
      )}

      {showValidation && (
        <ValidationPlanModal
          card={card}
          project={project}
          model={model}
          onClose={() => setShowValidation(false)}
        />
      )}
    </div>
  );
}
