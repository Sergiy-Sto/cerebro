import { useState, useEffect, type Dispatch } from 'react';
import type { Project, StageId } from '../state/types';
import { STAGES, MODULES } from '../state/stages';
import { stageStatus, statsForStage } from '../state/selectors';
import type { StoreAction } from '../state/store';

interface StagesColumnProps {
  project: Project;
  dispatch: Dispatch<StoreAction>;
}

function statusIcon(status: ReturnType<typeof stageStatus>): string {
  switch (status) {
    case 'done': return '✓';
    case 'active': return '●';
    case 'has-cards': return '·';
    case 'empty': return '○';
  }
}

function statusIconColor(status: ReturnType<typeof stageStatus>): string {
  switch (status) {
    case 'done': return 'text-emerald-600';
    case 'active': return 'text-blue-600';
    case 'has-cards': return 'text-gray-500';
    case 'empty': return 'text-gray-300';
  }
}

export default function StagesColumn({ project, dispatch }: StagesColumnProps) {
  // Найдём modyle активного stage — он раскрыт по умолчанию
  const activeStage = STAGES.find((s) => s.id === project.activeStageId);
  const activeModuleId = activeStage?.moduleId ?? MODULES[0].id;

  // Локальное состояние раскрытых модулей. По умолчанию — только активный модуль раскрыт.
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set([activeModuleId]));

  // Когда меняется активный stage — раскрыть его модуль (если ещё не раскрыт)
  useEffect(() => {
    if (activeModuleId && !expandedModules.has(activeModuleId)) {
      setExpandedModules((prev) => new Set([...prev, activeModuleId]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModuleId]);

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function handleClick(stageId: StageId) {
    dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId } });
  }

  return (
    <div className="w-60 shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Модули
      </div>
      <ul className="flex-1">
        {MODULES.map((module) => {
          const moduleStages = STAGES.filter((s) => s.moduleId === module.id);
          if (moduleStages.length === 0) return null;

          const isExpanded = expandedModules.has(module.id);
          const moduleTotalCards = moduleStages.reduce(
            (sum, s) => sum + statsForStage(project, s.id).total, 0
          );
          const moduleInteresting = moduleStages.reduce(
            (sum, s) => sum + statsForStage(project, s.id).interesting, 0
          );

          return (
            <li key={module.id} className="border-b border-gray-200">
              {/* Module header — clickable to collapse/expand */}
              <button
                onClick={() => toggleModule(module.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${module.bg} ${module.text} hover:brightness-95 transition-all`}
              >
                <span className="shrink-0 text-xs w-3">{isExpanded ? '▼' : '▶'}</span>
                <span className="flex-1 text-xs font-semibold truncate">{module.label}</span>
                {moduleTotalCards > 0 && (
                  <span className="shrink-0 text-xs opacity-70">
                    {moduleInteresting}★ / {moduleTotalCards}
                  </span>
                )}
              </button>

              {/* Sub-modules (stages within this module) */}
              {isExpanded && (
                <ul className="bg-white">
                  {moduleStages.map((stage) => {
                    const status = stageStatus(project, stage.id);
                    const stats = statsForStage(project, stage.id);
                    const isActive = project.activeStageId === stage.id;

                    return (
                      <li key={stage.id}>
                        <button
                          onClick={() => handleClick(stage.id)}
                          className={[
                            'w-full text-left pl-6 pr-3 py-1.5 flex items-center gap-2 border-l-4 text-sm',
                            isActive ? `${stage.bg} ${stage.border} ${stage.text} font-medium` : 'border-transparent bg-transparent text-gray-700 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          <span className={`shrink-0 w-4 text-center font-mono text-xs ${statusIconColor(status)}`}>
                            {statusIcon(status)}
                          </span>
                          <span className="flex-1 truncate text-xs">{stage.label}</span>
                          {stage.usesWebSearch && <span className="text-xs text-cyan-600">🌐</span>}
                          <span className="shrink-0 text-xs text-gray-400">
                            {stats.total > 0 ? `(${stats.total})` : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
