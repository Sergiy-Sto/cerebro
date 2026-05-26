import { useState, useRef, useEffect } from 'react';
import type { Card, Project } from '../state/types';
import { STAGES } from '../state/stages';
import { generateValidationPlanForHypothesisStream, getApiKey, type ValidationPlanContext } from '../utils/openai';
import CardDescription from './CardDescription';

interface ValidationPlanModalProps {
  card: Card;
  project: Project;
  model: string;
  onClose: () => void;
}

/**
 * Модалка генерации плана валидации для одной гипотезы.
 *
 * Заменяет старый 4.6 Validation стейдж (удалён 2026-05-26).
 * Плюсы:
 * - Платим только за то что реально тестируем (~$0.05-0.15 vs ~$0.25-0.83 за весь шортлист)
 * - План фокусный — одна гипотеза → детальный план, не размазанный
 * - Можно сгенерить несколько вариантов для одной гипотезы
 */
export default function ValidationPlanModal({ card, project, model, onClose }: ValidationPlanModalProps) {
  const [streamingPlan, setStreamingPlan] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generations, setGenerations] = useState<Array<{ text: string; timestamp: string; model: string; tokensIn: number; tokensOut: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const planEndRef = useRef<HTMLDivElement>(null);

  const stageConfig = STAGES.find((s) => s.id === card.stageId);

  // Автоскролл вниз при стриме
  useEffect(() => {
    planEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [streamingPlan, generations.length]);

  async function handleGenerate() {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('Нет API ключа OpenAI. Введите его в хедере.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStreamingPlan('');

    const controller = new AbortController();
    abortRef.current = controller;

    // Контекст для модели — родительские карточки гипотезы (через derivedFromIds)
    const ancestorIds = new Set(card.derivedFromIds ?? []);
    const ancestorCards = project.cards.filter((c) => ancestorIds.has(c.id));

    const ctx: ValidationPlanContext = {
      hypothesis: card,
      ancestorCards,
      projectFrame: project.frame,
      projectConstraints: project.constraints,
      projectCriteria: project.criteria,
    };

    try {
      const result = await generateValidationPlanForHypothesisStream(
        ctx,
        apiKey,
        (delta) => setStreamingPlan((prev) => prev + delta),
        model,
        {
          projectId: project.id,
          projectTitle: project.title,
          stageId: card.stageId,
          stageLabel: stageConfig?.label ?? card.stageId,
        },
        controller.signal
      );

      setGenerations((prev) => [
        ...prev,
        {
          text: result.fullText,
          timestamp: new Date().toISOString(),
          model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        },
      ]);
      setStreamingPlan('');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // прервано пользователем — не показываем как ошибку
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка генерации');
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }

  // Авто-старт первой генерации при открытии модалки
  useEffect(() => {
    if (!hasAutoStarted && generations.length === 0 && !isGenerating) {
      setHasAutoStarted(true);
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleCopyPlan(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      // ignore clipboard errors
    });
  }

  function handleDeleteGeneration(index: number) {
    if (!window.confirm('Удалить этот план валидации? Действие необратимо в этой сессии.')) return;
    setGenerations((prev) => prev.filter((_, i) => i !== index));
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
              🧪 План валидации
            </h2>
            <p className="text-sm text-gray-700 mt-1 font-medium truncate" title={card.title}>
              для гипотезы: «{card.title}»
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
            title="Закрыть"
          >
            ×
          </button>
        </div>

        {/* Содержание */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-gray-50">
          {/* Прежние сгенерированные планы */}
          {generations.map((g, i) => (
            <div key={i} className="bg-white border border-sky-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-sky-700 font-medium">
                  Вариант плана #{i + 1}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyPlan(g.text)}
                    className="text-xs text-gray-500 hover:text-gray-800 underline"
                    title="Скопировать в буфер обмена"
                  >
                    📋 копия
                  </button>
                  <button
                    onClick={() => handleDeleteGeneration(i)}
                    className="text-xs text-gray-300 hover:text-red-500"
                    title="Удалить этот вариант"
                  >
                    ×
                  </button>
                </div>
              </div>
              <CardDescription text={g.text} />
              <p className="text-[10px] text-gray-400 mt-3 font-mono">
                {new Date(g.timestamp).toLocaleString('ru-RU')} · {g.model} · {g.tokensIn}→{g.tokensOut} ток.
              </p>
            </div>
          ))}

          {/* Текущий стримящийся план */}
          {isGenerating && (
            <div className="bg-white border border-sky-300 p-4">
              <p className="text-xs text-sky-700 font-medium mb-2">
                Вариант плана #{generations.length + 1} <span className="animate-pulse">·</span> генерируется...
              </p>
              {streamingPlan ? (
                <CardDescription text={streamingPlan} />
              ) : (
                <p className="text-sm text-gray-400 italic">Думаю над планом теста...</p>
              )}
            </div>
          )}

          {!isGenerating && generations.length === 0 && !streamingPlan && (
            <div className="text-center text-sm text-gray-400 py-8">
              <p>План валидации появится здесь.</p>
            </div>
          )}

          <div ref={planEndRef} />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3">
          {error && (
            <p className="text-xs text-red-500 mb-2 break-words">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-400">
              План не сохраняется в проекте. Скопируй что нужно — или сгенерируй ещё вариант.
            </p>
            <div className="flex gap-2">
              {isGenerating ? (
                <button
                  onClick={handleStop}
                  className="px-4 py-1.5 text-xs border border-red-400 text-red-700 bg-white hover:bg-red-50"
                >
                  Стоп
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  className="px-4 py-1.5 text-xs font-medium bg-sky-600 text-white hover:bg-sky-700"
                >
                  {generations.length === 0 ? '🧪 Сгенерировать план' : '🔄 Сгенерировать ещё вариант'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
