import { useRef, useState, useEffect, type Dispatch, type ChangeEvent } from 'react';
import type { Project, Card } from '../state/types';
import type { StoreAction } from '../state/store';
import { getCard, cardsByStage } from '../state/selectors';
import { STAGES } from '../state/stages';
import { downloadJson } from '../utils/download';
import { newId } from '../utils/id';
import { getApiKey, generateCardsStream } from '../utils/openai';
import StagesColumn from '../components/StagesColumn';
import CardsColumn from '../components/CardsColumn';
import CardDetail from '../components/CardDetail';
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
  const [autoGenProgress, setAutoGenProgress] = useState('');
  const [autoGenError, setAutoGenError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);

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
          activeStageId: data.activeStageId ?? 'definition',
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
    let baseProject = projectRef.current;

    const allFilled = STAGES.every(s => cardsByStage(baseProject, s.id).length > 0);
    if (allFilled) {
      const ok = window.confirm(
        'Все этапы уже заполнены.\nОчистить все карточки и сгенерировать заново?'
      );
      if (!ok) return;
      baseProject = { ...baseProject, cards: [], selectedCardId: null, updatedAt: new Date().toISOString() };
      dispatch({ type: 'UPDATE_PROJECT', payload: baseProject });
    }

    setIsAutoGenerating(true);
    setAutoGenError(null);

    // Local card accumulator — not affected by async React render timing
    const generatedCards: Card[] = [];

    try {
      for (let i = 0; i < STAGES.length; i++) {
        const stage = STAGES[i];

        // Skip stages that already had cards in the snapshot OR were generated this run
        const alreadyHas =
          cardsByStage(baseProject, stage.id).length > 0 ||
          generatedCards.some(c => c.stageId === stage.id);
        if (alreadyHas) continue;

        setAutoGenProgress(`${i + 1} / ${STAGES.length}: ${stage.label}`);
        dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId: stage.id } });

        const prevIds = STAGES.filter(s => s.order < stage.order).map(s => s.id);
        // Context: ★-marked from snapshot + everything generated this run in prev stages
        const contextCards = [
          ...baseProject.cards.filter(c => prevIds.includes(c.stageId) && c.status === 'interesting'),
          ...generatedCards.filter(c => prevIds.includes(c.stageId)),
        ].filter((c, idx, arr) => arr.findIndex(x => x.id === c.id) === idx);

        let maxNum = 0;
        await generateCardsStream(stage.id, baseProject, apiKey, contextCards, [], (gen) => {
          maxNum++;
          const card: Card = {
            id: newId(), number: maxNum, stageId: stage.id,
            type: stage.expectedCardType,
            title: gen.title, description: gen.description, tags: gen.tags,
            status: 'neutral', parentId: null, createdAt: new Date().toISOString(),
            metrics: gen.metrics, analysis: gen.analysis,
          };
          generatedCards.push(card);
          dispatch({ type: 'ADD_CARD', payload: { projectId: baseProject.id, card } });
        });
      }
    } catch (err) {
      setAutoGenError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setIsAutoGenerating(false);
      setAutoGenProgress('');
    }
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
          <button
            onClick={handleAutoGenerateAll}
            disabled={isAutoGenerating || !hasApiKey}
            title={!hasApiKey ? 'Сначала введите API ключ' : 'Сгенерировать все этапы по цепочке'}
            className={[
              'px-2.5 py-1.5 text-xs border',
              isAutoGenerating
                ? 'border-emerald-200 text-emerald-400 cursor-not-allowed'
                : !hasApiKey
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
            ].join(' ')}
          >
            {isAutoGenerating ? `⏳ ${autoGenProgress}` : '🚀 Запустить всё'}
          </button>
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
        />
        <CardDetail card={selectedCard} project={project} dispatch={dispatch} />
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
