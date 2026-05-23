import { useState, type Dispatch } from 'react';
import type { Card, Project } from '../state/types';
import { STAGES } from '../state/stages';
import { getCard, cardsByStage } from '../state/selectors';
import type { StoreAction } from '../state/store';
import CardForm from './CardForm';
import ConfirmDialog from './ConfirmDialog';

interface CardDetailProps {
  card: Card | null;
  project: Project;
  dispatch: Dispatch<StoreAction>;
}

export default function CardDetail({ card, project, dispatch }: CardDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChildForm, setShowChildForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        <div className="flex gap-2 flex-wrap text-xs text-gray-400 mb-2">
          <span>{card.type.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span>{stageConfig.label}</span>
          <span>·</span>
          <span>#{card.number}</span>
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

        {/* Description */}
        <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">{card.description}</p>

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
    </div>
  );
}
