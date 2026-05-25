import { useRef, useState, useEffect, type Dispatch, type ChangeEvent } from 'react';
import type { Project, Card } from '../state/types';
import type { StoreAction } from '../state/store';
import { getCard, cardsByStage, getContextCardsForStage } from '../state/selectors';
import { STAGES, FIRST_STAGE_ID } from '../state/stages';
import { downloadJson } from '../utils/download';
import { newId } from '../utils/id';
import { getApiKey, generateCardsStream, generateWithSearchStream } from '../utils/openai';
import StagesColumn from '../components/StagesColumn';
import CardsColumn from '../components/CardsColumn';
import CardDetail from '../components/CardDetail';
import CostBadge from '../components/CostBadge';
import ProjectForm from './ProjectForm';
import ApiKeyModal from '../components/ApiKeyModal';

interface WorkbenchProps {
  project: Project;
  dispatch: Dispatch<StoreAction>;
}

export default function Workbench({ project, dispatch }: WorkbenchProps) {
  const [showEditProject, setShowEditProject] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoGenProgress, setAutoGenProgress] = useState('');
  const [autoGenError, setAutoGenError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gpt-5.5');
  const importRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  // Refs для async-loop control (state не виден внутри уже-запущенной async function)
  const pauseRef = useRef(false);
  const stopRef = useRef(false);
  const skipCurrentRef = useRef(false);
  const autoAllAbortRef = useRef<AbortController | null>(null);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { pauseRef.current = isPaused; }, [isPaused]);

  // Migration: если activeStageId указывает на несуществующий stage
  // (старые проекты с definition/invert/observation/etc) — переключаем на первый.
  useEffect(() => {
    const isValid = STAGES.some((s) => s.id === project.activeStageId);
    if (!isValid) {
      dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId: FIRST_STAGE_ID } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Auto-start on new empty projects
  // Auto-start ОТКЛЮЧЁН (2026-05-26):
  // Раньше на новых пустых проектах автоматически запускался handleAutoGenerateAll.
  // Теперь пользователь сам жмёт "🚀 Запустить всё" когда готов.
  // Это даёт контроль над тратами и не запускает дорогую цепочку случайно.

  const selectedCard = project.selectedCardId
    ? getCard(project, project.selectedCardId)
    : null;

  const hasApiKey = Boolean(getApiKey());

  function handleExport() {
    const { selectedCardId: _sid, activeStageId: _asid, ...exportData } = project;
    const date = new Date().toISOString().split('T')[0];
    const safeTitle = project.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    downloadJson(exportData, `${safeTitle}-${date}.json`);
  }

  function handleImportClick() {
    importRef.current?.click();
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.title || !data.frame || !Array.isArray(data.cards)) {
          alert('Неверный файл проекта: должны быть поля title, frame и cards.');
          return;
        }
        const now = new Date().toISOString();
        const imported: Project = {
          ...data,
          id: newId(),
          activeStageId: data.activeStageId ?? FIRST_STAGE_ID,
          selectedCardId: null,
          createdAt: data.createdAt ?? now,
          updatedAt: now,
        };
        dispatch({ type: 'CREATE_PROJECT', payload: imported });
      } catch {
        alert('Не удалось разобрать JSON файл.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleAutoGenerateAll() {
    const apiKey = getApiKey();
    if (!apiKey) { setShowApiKeyModal(true); return; }

    // Snapshot project state NOW (avoid stale ref issues inside async loop)
    const baseProject = projectRef.current;

    setIsAutoGenerating(true);
    setIsPaused(false);
    pauseRef.current = false;
    stopRef.current = false;
    skipCurrentRef.current = false;
    setAutoGenError(null);

    // Local card accumulator — not affected by async React render timing
    const generatedCards: Card[] = [];

    try {
      for (let i = 0; i < STAGES.length; i++) {
        // Если на паузе — ждём пока снимут, проверяя каждые 250мс. Стоп — выход.
        while (pauseRef.current && !stopRef.current) {
          setAutoGenProgress(`⏸ Пауза на ${i + 1}/${STAGES.length}: ${STAGES[i].label}`);
          await new Promise((r) => setTimeout(r, 250));
        }
        if (stopRef.current) break;

        // Сбросим skip-флаг перед каждым стейджем (если предыдущий был skipped)
        skipCurrentRef.current = false;

        const stage = STAGES[i];

        // Skip stages that already had cards in the snapshot OR were generated this run
        const alreadyHas =
          cardsByStage(baseProject, stage.id).length > 0 ||
          generatedCards.some(c => c.stageId === stage.id);
        if (alreadyHas) continue;

        setAutoGenProgress(`${i + 1} / ${STAGES.length}: ${stage.label}${stage.usesWebSearch ? ' (🌐 поиск)' : ''}`);
        dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId: stage.id } });

        // Контекст с применением правил:
        // - только предыдущие по order
        // - без ✗ Отклонённых
        // - без целых модулей которые не нужны late-stage (см. selectors.ts)
        const contextCards = getContextCardsForStage(baseProject, stage.id, generatedCards);

        let maxNum = 0;
        const onCard = (gen: any) => {
          maxNum++;
          const card: Card = {
            id: newId(), number: maxNum, stageId: stage.id,
            type: stage.expectedCardType,
            title: gen.title, description: gen.description, tags: gen.tags,
            status: 'neutral', parentId: null, createdAt: new Date().toISOString(),
            metrics: gen.metrics, analysis: gen.analysis,
            model: selectedModel,
            derivedFromIds: gen.derivedFromIds,
            sources: gen.sources,
            confidence: stage.usesWebSearch ? 'search_snippet_supported' : 'assumed',
          };
          generatedCards.push(card);
          dispatch({ type: 'ADD_CARD', payload: { projectId: baseProject.id, card } });
        };

        const logContext = {
          projectId: baseProject.id,
          projectTitle: baseProject.title,
          stageId: stage.id,
          stageLabel: stage.label,
        };

        // Создаём новый AbortController на каждый стейдж — Stop / Skip сразу прервёт текущий fetch
        const controller = new AbortController();
        autoAllAbortRef.current = controller;

        // Локальный try/catch на каждую итерацию — позволяет Skip продолжить с следующего стейджа
        try {
          if (stage.usesWebSearch) {
            await generateWithSearchStream(
              stage.id, baseProject, apiKey, contextCards, [],
              onCard,
              (p) => {
                if (p.phase === 'searching' && p.currentQuery) {
                  setAutoGenProgress(`${i + 1} / ${STAGES.length}: 🔍 ${p.queriesCount}/12 — "${p.currentQuery.slice(0, 50)}"`);
                } else if (p.phase === 'writing') {
                  setAutoGenProgress(`${i + 1} / ${STAGES.length}: ✍ Синтезирую (${p.queriesCount} поисков)`);
                }
              },
              selectedModel,
              logContext,
              controller.signal
            );
          } else {
            await generateCardsStream(stage.id, baseProject, apiKey, contextCards, [], onCard, selectedModel, logContext, controller.signal);
          }
        } catch (stageErr) {
          const isAbort = (stageErr instanceof DOMException && stageErr.name === 'AbortError') ||
                          (stageErr instanceof Error && stageErr.message.toLowerCase().includes('abort'));

          if (skipCurrentRef.current) {
            // Skip — переходим к следующему стейджу. Карточки которые успели сгенериться — остаются.
            skipCurrentRef.current = false;
            continue;
          }
          if (stopRef.current) {
            // Stop — выход из всего цикла
            break;
          }
          if (isAbort) {
            // Abort без явного skip/stop флага — нестандартная ситуация, тоже продолжим
            continue;
          }
          // Реальная ошибка — записываем и выходим из цикла
          throw stageErr;
        }
      }
    } catch (err) {
      // Реальные ошибки (не abort)
      setAutoGenError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setIsAutoGenerating(false);
      setIsPaused(false);
      pauseRef.current = false;
      stopRef.current = false;
      skipCurrentRef.current = false;
      setAutoGenProgress('');
    }
  }

  function handlePauseToggle() {
    setIsPaused((p) => !p);
  }

  function handleResetAndRegenerate() {
    const total = project.cards.length;
    const cost = '~$1.50-2.50'; // приблизительная оценка полного auto-all
    const ok = window.confirm(
      `⚠️ Очистить ${total} карточек и сгенерировать ВСЁ заново с нуля?\n\n` +
      `Стоимость полного прогона: ${cost} (зависит от моделей и web search).\n\n` +
      `Действие необратимо. Текущие карточки будут безвозвратно удалены.`
    );
    if (!ok) return;

    const cleared = { ...projectRef.current, cards: [], selectedCardId: null, updatedAt: new Date().toISOString() };
    dispatch({ type: 'UPDATE_PROJECT', payload: cleared });
    // Чуть подождать чтобы dispatch применился, потом запустить
    setTimeout(() => handleAutoGenerateAll(), 100);
  }

  function handleStop() {
    stopRef.current = true;
    setIsPaused(false);
    pauseRef.current = false;
    setAutoGenProgress('Остановка...');
    // Мгновенно прерываем текущий fetch — не ждём конца стейджа
    autoAllAbortRef.current?.abort();
  }

  function handleSkipCurrent() {
    // Прервать только текущий стейдж — auto-all продолжится со следующего
    skipCurrentRef.current = true;
    setAutoGenProgress('Пропускаем стейдж...');
    autoAllAbortRef.current?.abort();
  }

  function handleGoToProjects() {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: '' } });
  }

  function handleSaveProject(data: { title: string; frame: string; constraints: string[]; criteria: string[] }) {
    const now = new Date().toISOString();
    dispatch({
      type: 'UPDATE_PROJECT',
      payload: { ...project, ...data, updatedAt: now },
    });
    setShowEditProject(false);
  }

  const constraintsPart = project.constraints.length > 0
    ? `Constraints: ${project.constraints.join(', ')}`
    : '';
  const criteriaPart = project.criteria.length > 0
    ? `Criteria: ${project.criteria.join(', ')}`
    : '';
  const summaryParts = [project.frame, constraintsPart, criteriaPart].filter(Boolean);
  const summary = summaryParts.join(' · ');

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <button onClick={() => setShowEditProject(true)} className="text-left group">
            <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">
              {project.title}
            </span>
            <p className="text-xs text-gray-400 truncate max-w-xl mt-0.5">{summary}</p>
          </button>
        </div>

        <div className="flex gap-2 shrink-0 items-center">
          <a
            href={`https://github.com/Sergiy-Sto/cerebro/commit/${__GIT_HASH__}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-300 hover:text-gray-500 font-mono"
            title={new Date(__BUILD_TIME__).toLocaleString('ru-RU')}
          >
            {__GIT_HASH__}
          </a>
          <CostBadge />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isAutoGenerating}
            className="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            title="Модель OpenAI. o-series retired в 2026, остались gpt-5.x"
          >
            <option value="gpt-5.5">gpt-5.5 (Instant — дефолт)</option>
            <option value="gpt-5.4-thinking">gpt-5.4 Thinking</option>
            <option value="gpt-5.4-pro">gpt-5.4 Pro</option>
            <option value="gpt-5.4">gpt-5.4</option>
            <option value="gpt-5.4-mini">gpt-5.4-mini</option>
            <option value="gpt-4.1">gpt-4.1 (legacy)</option>
          </select>
          {!isAutoGenerating ? (() => {
            const filledStages = STAGES.filter(s => cardsByStage(project, s.id).length > 0).length;
            const allFilled = filledStages === STAGES.length;
            const noneFilled = filledStages === 0;
            const hasAnyCards = filledStages > 0;

            let label: string;
            let tooltip: string;
            let mainDisabled = false;
            if (noneFilled) {
              label = '🚀 Запустить всё';
              tooltip = 'Сгенерировать все этапы по цепочке';
            } else if (allFilled) {
              label = '✓ Все этапы готовы';
              tooltip = 'Все 18 этапов заполнены. Для пересборки используй красную кнопку «Очистить и заново».';
              mainDisabled = true;
            } else {
              label = '▶ Продолжить генерацию';
              tooltip = `Заполнено ${filledStages}/${STAGES.length} этапов. Auto-all пропустит готовые, сгенерирует только пустые. Данные не пострадают.`;
            }

            return (
              <>
                <button
                  onClick={handleAutoGenerateAll}
                  disabled={!hasApiKey || mainDisabled}
                  title={!hasApiKey ? 'Сначала введите API ключ' : tooltip}
                  className={[
                    'px-2.5 py-1.5 text-xs border',
                    !hasApiKey || mainDisabled
                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                      : 'border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
                  ].join(' ')}
                >
                  {label}
                </button>
                {hasAnyCards && (
                  <button
                    onClick={handleResetAndRegenerate}
                    disabled={!hasApiKey}
                    title={`Удалить все ${project.cards.length} карточки и сгенерировать заново с нуля. Действие необратимо.`}
                    className="px-2 py-1.5 text-xs border border-gray-300 text-gray-500 bg-white hover:bg-gray-50 hover:text-gray-700"
                  >
                    🗑 Очистить и заново
                  </button>
                )}
              </>
            );
          })() : (
            <div className="flex gap-1 items-center">
              <span className="text-xs text-gray-500 max-w-[260px] truncate" title={autoGenProgress}>
                {isPaused ? `⏸ ${autoGenProgress}` : `⏳ ${autoGenProgress}`}
              </span>
              <button
                onClick={handlePauseToggle}
                title={isPaused ? 'Продолжить с текущего стейджа' : 'Пауза после текущего стейджа'}
                className={[
                  'px-2.5 py-1.5 text-xs border font-medium',
                  isPaused
                    ? 'border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    : 'border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100',
                ].join(' ')}
              >
                {isPaused ? '▶ Продолжить' : '⏸ Пауза'}
              </button>
              <button
                onClick={handleStop}
                title="Остановить генерацию полностью"
                className="px-2.5 py-1.5 text-xs border border-red-400 text-red-700 bg-red-50 hover:bg-red-100 font-medium"
              >
                Стоп
              </button>
            </div>
          )}
          {autoGenError && (
            <span className="text-xs text-red-500 max-w-[160px] truncate" title={autoGenError}>
              {autoGenError}
            </span>
          )}
          <button
            onClick={() => setShowApiKeyModal(true)}
            title={hasApiKey ? 'API ключ установлен — нажмите для изменения' : 'Введите OpenAI API ключ'}
            className={[
              'px-2.5 py-1.5 text-xs border',
              hasApiKey
                ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100'
                : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100',
            ].join(' ')}
          >
            {hasApiKey ? '⚡ AI готов' : '⚙ Ввести API ключ'}
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Экспорт JSON
          </button>
          <button
            onClick={handleImportClick}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Импорт JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleGoToProjects}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Проекты
          </button>
        </div>
      </header>

      {/* Body: 3 columns */}
      <div className="flex-1 flex overflow-hidden">
        <StagesColumn project={project} dispatch={dispatch} />
        <CardsColumn
          project={project}
          dispatch={dispatch}
          onOpenApiKey={() => setShowApiKeyModal(true)}
          autoGenerating={isAutoGenerating}
          model={selectedModel}
          onSkipAutoAllStage={handleSkipCurrent}
        />
        <CardDetail card={selectedCard} project={project} dispatch={dispatch} model={selectedModel} />
      </div>

      {showEditProject && (
        <ProjectForm
          project={project}
          onSave={handleSaveProject}
          onCancel={() => setShowEditProject(false)}
        />
      )}

      {showApiKeyModal && (
        <ApiKeyModal onClose={() => setShowApiKeyModal(false)} />
      )}
    </div>
  );
}
