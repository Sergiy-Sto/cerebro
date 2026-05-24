import { useState, useEffect, useRef, type Dispatch } from 'react';
import type { Project } from '../state/types';
import { STAGES } from '../state/stages';
import { cardsByStage, statsForStage, getCard } from '../state/selectors';
import type { StoreAction } from '../state/store';
import { getApiKey, generateCardsStream, generateWithSearchStream, type SearchProgress } from '../utils/openai';
import { newId } from '../utils/id';
import CardForm from './CardForm';

interface CardsColumnProps {
  project: Project;
  dispatch: Dispatch<StoreAction>;
  onOpenApiKey: () => void;
  autoGenerating?: boolean;
  model?: string;
}

export default function CardsColumn({ project, dispatch, onOpenApiKey, autoGenerating, model = 'gpt-5.5' }: CardsColumnProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const autoGenKey = useRef('');

  const stageConfig = STAGES.find((s) => s.id === project.activeStageId)!;
  const cards = cardsByStage(project, project.activeStageId).sort((a, b) => a.number - b.number);
  const stats = statsForStage(project, project.activeStageId);

  const currentStageIndex = STAGES.findIndex((s) => s.id === project.activeStageId);
  const isLastStage = currentStageIndex === STAGES.length - 1;
  const nextStage = !isLastStage ? STAGES[currentStageIndex + 1] : null;
  const canAdvance = stats.interesting >= 1 && !isLastStage;

  useEffect(() => {
    if (autoGenerating) return;
    if (project.cards.length === 0) return; // свежий проект — auto-all в Workbench
    const key = `${project.id}:${project.activeStageId}`;
    if (cards.length === 0 && getApiKey() && !isGenerating && autoGenKey.current !== key) {
      autoGenKey.current = key;
      handleGenerate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.activeStageId, cards.length, autoGenerating, project.cards.length]);

  function handleNextStage() {
    if (nextStage) {
      dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId: nextStage.id } });
    }
  }

  function handleSelectCard(cardId: string) {
    dispatch({ type: 'SET_SELECTED_CARD', payload: { cardId } });
  }

  function getParentLabel(parentId: string): string {
    const parent = getCard(project, parentId);
    if (!parent) return '';
    const parentStage = STAGES.find((s) => s.id === parent.stageId);
    return `↳ из ${parentStage?.label ?? parent.stageId} #${parent.number}`;
  }

  async function handleGenerate(isThinkMore = false) {
    const apiKey = getApiKey();
    if (!apiKey) {
      onOpenApiKey();
      return;
    }

    setIsGenerating(true);
    setGenError(null);
    setSearchProgress(null);

    try {
      const prevStageIds = STAGES.filter((s) => s.order < stageConfig.order).map((s) => s.id);
      const contextCards = project.cards.filter((c) => prevStageIds.includes(c.stageId));
      const existingCards = isThinkMore ? cards : [];

      const stageCards = cardsByStage(project, project.activeStageId);
      let maxNum = stageCards.reduce((m, c) => Math.max(m, c.number), 0);

      const onCard = (gen: { title: string; description: string; tags: string[]; metrics?: any; analysis?: string; derivedFromIds?: string[]; sources?: { title: string; url: string }[] }) => {
        maxNum++;
        dispatch({
          type: 'ADD_CARD',
          payload: {
            projectId: project.id,
            card: {
              id: newId(),
              number: maxNum,
              stageId: project.activeStageId,
              type: stageConfig.expectedCardType,
              title: gen.title,
              description: gen.description,
              tags: gen.tags,
              status: 'neutral',
              parentId: null,
              createdAt: new Date().toISOString(),
              metrics: gen.metrics,
              analysis: gen.analysis,
              model,
              derivedFromIds: gen.derivedFromIds,
              sources: gen.sources,
              confidence: stageConfig.usesWebSearch ? 'search_snippet_supported' : 'assumed',
            },
          },
        });
      };

      const logContext = {
        projectId: project.id,
        projectTitle: project.title,
        stageId: stageConfig.id,
        stageLabel: stageConfig.label,
      };

      if (stageConfig.usesWebSearch) {
        await generateWithSearchStream(
          project.activeStageId, project, apiKey, contextCards, existingCards,
          onCard,
          (p) => setSearchProgress(p),
          model,
          logContext
        );
      } else {
        await generateCardsStream(
          project.activeStageId, project, apiKey, contextCards, existingCards,
          onCard,
          model,
          logContext
        );
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setIsGenerating(false);
      setSearchProgress(null);
    }
  }

  return (
    <div className="w-[360px] shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b border-gray-200 ${stageConfig.bg}`}>
        <h2 className={`text-base font-semibold ${stageConfig.text}`}>{stageConfig.label}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {stats.total} карт · {stats.interesting}★ · {stats.discarded}✗
          {stageConfig.usesWebSearch && <span className="ml-2 text-cyan-600">🌐 web search</span>}
        </p>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {cards.length === 0 && !isGenerating && (
          <p className="text-sm text-gray-400 text-center mt-8">Карточек нет. Добавьте или сгенерируйте.</p>
        )}

        {/* Search progress (только для web search stages) */}
        {isGenerating && stageConfig.usesWebSearch && searchProgress && (
          <div className="bg-cyan-50 border border-cyan-200 px-3 py-2 mb-2 text-xs">
            {searchProgress.phase === 'searching' && (
              <>
                <p className="font-medium text-cyan-800">🔍 Поиск {searchProgress.queriesCount ?? ''}/12…</p>
                {searchProgress.currentQuery && (
                  <p className="text-cyan-600 mt-0.5 font-mono truncate">"{searchProgress.currentQuery}"</p>
                )}
              </>
            )}
            {searchProgress.phase === 'writing' && (
              <p className="font-medium text-cyan-800">✍ Синтезирую найденное в карточки…</p>
            )}
          </div>
        )}

        <ul className="space-y-1.5">
          {cards.map((card) => {
            const isSelected = project.selectedCardId === card.id;
            return (
              <li key={card.id}>
                <button
                  onClick={() => handleSelectCard(card.id)}
                  className={[
                    'w-full text-left border border-gray-200 px-3 py-2 text-sm',
                    isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white hover:bg-gray-50',
                    card.status === 'discarded' ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 w-5 text-center text-xs">
                      {card.status === 'interesting' && <span className="text-amber-500">★</span>}
                      {card.status === 'discarded' && <span className="text-gray-400">✗</span>}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">#{card.number}</span>
                    <span className="flex-1 truncate text-gray-800 font-medium">{card.title}</span>
                  </div>
                  <div className="ml-7 mt-0.5 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">{card.type.replace(/_/g, ' ')}</span>
                      {card.model && <span className="text-xs text-violet-400 font-mono">{card.model}</span>}
                      {card.sources && card.sources.length > 0 && (
                        <span className="text-xs text-cyan-600">🌐 {card.sources.length}</span>
                      )}
                    </div>
                    {card.parentId && (
                      <span className="text-xs text-gray-400">{getParentLabel(card.parentId)}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sticky bottom */}
      <div className="border-t border-gray-200 px-3 py-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => handleGenerate(false)}
            disabled={isGenerating || cards.length > 0}
            className={[
              'flex-1 px-2 py-2 text-xs font-medium',
              isGenerating || cards.length > 0
                ? 'bg-violet-100 text-violet-400 cursor-not-allowed'
                : stageConfig.usesWebSearch
                ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                : 'bg-violet-600 text-white hover:bg-violet-700',
            ].join(' ')}
          >
            {isGenerating && cards.length === 0
              ? (stageConfig.usesWebSearch ? '🌐 Ищу…' : '⏳ Генерирую…')
              : (stageConfig.usesWebSearch ? '🌐 Запустить поиск' : '⚡ Генерировать')}
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={isGenerating || cards.length === 0}
            className={[
              'flex-1 px-2 py-2 text-xs font-medium border',
              isGenerating && cards.length > 0
                ? 'border-violet-200 text-violet-400 cursor-not-allowed'
                : cards.length === 0
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-violet-400 text-violet-700 hover:bg-violet-50',
            ].join(' ')}
          >
            {isGenerating && cards.length > 0
              ? '⏳ Думаю…'
              : (stageConfig.usesWebSearch ? '💡 Ещё поиск' : '💡 Думай ещё')}
          </button>
        </div>

        {genError && <p className="text-xs text-red-500 break-words">{genError}</p>}

        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          + Добавить вручную
        </button>

        <p className="text-xs text-gray-500">Выбрано: {stats.interesting}★ из {stats.total}</p>

        <button
          onClick={handleNextStage}
          disabled={!canAdvance}
          className={[
            'w-full px-2 py-1.5 text-xs border',
            isLastStage
              ? 'border-gray-200 text-gray-400 cursor-default'
              : canAdvance
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              : 'border-gray-200 text-gray-400 cursor-not-allowed',
          ].join(' ')}
        >
          {isLastStage ? 'Готово ✓' : '→ Следующий этап'}
        </button>
      </div>

      {showAddForm && (
        <CardForm
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
                  confidence: 'user_provided',
                },
              },
            });
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

    </div>
  );
}
