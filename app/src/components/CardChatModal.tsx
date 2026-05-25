import { useState, useRef, useEffect, type Dispatch } from 'react';
import type { Card, Project, CardDiscussion } from '../state/types';
import { STAGES } from '../state/stages';
import type { StoreAction } from '../state/store';
import { askQuestionStream, getApiKey, type CardChatContext } from '../utils/openai';
import CardDescription from './CardDescription';

interface CardChatModalProps {
  card: Card;
  project: Project;
  model: string;
  dispatch: Dispatch<StoreAction>;
  onClose: () => void;
}

export default function CardChatModal({ card, project, model, dispatch, onClose }: CardChatModalProps) {
  const [question, setQuestion] = useState('');
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stageConfig = STAGES.find((s) => s.id === card.stageId);
  const discussions: CardDiscussion[] = card.discussions ?? [];

  // Автоскролл вниз при новых сообщениях / стриме
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [discussions.length, streamingAnswer]);

  // Фокус на textarea при открытии
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Cmd/Ctrl + Enter для отправки
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAsk();
    }
  }

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || isAsking) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      setError('Нет API ключа OpenAI. Введите его в хедере.');
      return;
    }

    setIsAsking(true);
    setError(null);
    setStreamingAnswer('');

    const controller = new AbortController();
    abortRef.current = controller;

    // Контекст для модели — карточка + её предки через derivedFromIds
    const ancestorIds = new Set(card.derivedFromIds ?? []);
    const ancestorCards = project.cards.filter((c) => ancestorIds.has(c.id));

    const ctx: CardChatContext = {
      card,
      ancestorCards,
      projectFrame: project.frame,
      stageLabel: stageConfig?.label ?? card.stageId,
      history: discussions.map((d) => ({ q: d.q, a: d.a })),
    };

    try {
      const result = await askQuestionStream(
        ctx,
        trimmed,
        apiKey,
        (delta) => setStreamingAnswer((prev) => prev + delta),
        model,
        {
          projectId: project.id,
          projectTitle: project.title,
          stageId: card.stageId,
          stageLabel: stageConfig?.label ?? card.stageId,
        },
        controller.signal
      );

      // Сохраняем Q&A в карточку
      const newDiscussion: CardDiscussion = {
        q: trimmed,
        a: result.fullAnswer,
        timestamp: new Date().toISOString(),
        model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      };
      const updatedCard: Card = {
        ...card,
        discussions: [...discussions, newDiscussion],
      };
      dispatch({
        type: 'UPDATE_CARD',
        payload: { projectId: project.id, card: updatedCard },
      });

      setQuestion('');
      setStreamingAnswer('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // прервано пользователем — не показываем как ошибку
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка запроса');
      }
    } finally {
      setIsAsking(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleDeleteDiscussion(index: number) {
    if (!window.confirm('Удалить этот вопрос-ответ?')) return;
    const next = discussions.filter((_, i) => i !== index);
    const updatedCard: Card = { ...card, discussions: next };
    dispatch({
      type: 'UPDATE_CARD',
      payload: { projectId: project.id, card: updatedCard },
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              💬 Спросить о карточке
            </h2>
            <p className="text-sm text-gray-700 mt-1 font-medium truncate" title={card.title}>
              «{card.title}»
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {stageConfig?.label ?? card.stageId} · #{card.number} · модель: <span className="font-mono">{model}</span>
              {(card.derivedFromIds && card.derivedFromIds.length > 0) && (
                <span> · контекст: +{card.derivedFromIds.length} родителей</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
            title="Закрыть (карточка и история сохранятся)"
          >
            ×
          </button>
        </div>

        {/* История + стримящийся ответ */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
          {discussions.length === 0 && !streamingAnswer && (
            <div className="text-center text-sm text-gray-400 py-8">
              <p>Спроси что-нибудь о карточке.</p>
              <p className="mt-1 text-xs">Модель знает её содержание + контекст из родительских карточек.</p>
            </div>
          )}

          {discussions.map((d, i) => (
            <div key={i} className="space-y-2">
              {/* Question */}
              <div className="flex gap-2 items-start">
                <div className="shrink-0 mt-0.5 w-6 h-6 bg-blue-500 text-white text-xs flex items-center justify-center rounded">Q</div>
                <div className="flex-1 bg-white border border-blue-200 p-3 text-sm">
                  <p className="whitespace-pre-wrap text-gray-800">{d.q}</p>
                </div>
                <button
                  onClick={() => handleDeleteDiscussion(i)}
                  className="shrink-0 text-gray-300 hover:text-red-500 text-xs px-1"
                  title="Удалить этот обмен"
                >×</button>
              </div>
              {/* Answer */}
              <div className="flex gap-2 items-start">
                <div className="shrink-0 mt-0.5 w-6 h-6 bg-gray-200 text-gray-700 text-xs flex items-center justify-center rounded">A</div>
                <div className="flex-1 bg-white border border-gray-200 p-3">
                  <CardDescription text={d.a} />
                  <p className="text-[10px] text-gray-400 mt-2 font-mono">
                    {new Date(d.timestamp).toLocaleString('ru-RU')} · {d.model} · {d.tokensIn}→{d.tokensOut} ток.
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Текущий стримящийся ответ */}
          {isAsking && (
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <div className="shrink-0 mt-0.5 w-6 h-6 bg-blue-500 text-white text-xs flex items-center justify-center rounded">Q</div>
                <div className="flex-1 bg-white border border-blue-200 p-3 text-sm">
                  <p className="whitespace-pre-wrap text-gray-800">{question.trim()}</p>
                </div>
              </div>
              <div className="flex gap-2 items-start">
                <div className="shrink-0 mt-0.5 w-6 h-6 bg-gray-200 text-gray-700 text-xs flex items-center justify-center rounded animate-pulse">A</div>
                <div className="flex-1 bg-white border border-gray-200 p-3">
                  {streamingAnswer ? (
                    <CardDescription text={streamingAnswer} />
                  ) : (
                    <p className="text-sm text-gray-400 italic">Думаю...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={historyEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 px-5 py-3">
          {error && (
            <p className="text-xs text-red-500 mb-2 break-words">{error}</p>
          )}
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Что хочешь уточнить? (Ctrl/Cmd + Enter — отправить)"
            disabled={isAsking}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:border-blue-400 resize-none disabled:bg-gray-50 disabled:text-gray-500"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-gray-400">
              Ответ запоминается на карточке и доступен в следующих этапах.
            </p>
            <div className="flex gap-2">
              {isAsking ? (
                <button
                  onClick={handleStop}
                  className="px-4 py-1.5 text-xs border border-red-400 text-red-700 bg-white hover:bg-red-50"
                >
                  Стоп
                </button>
              ) : (
                <button
                  onClick={handleAsk}
                  disabled={!question.trim()}
                  className={[
                    'px-4 py-1.5 text-xs font-medium',
                    question.trim()
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                  ].join(' ')}
                >
                  💬 Спросить
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
