import type { Dispatch } from 'react';
import type { Project, StageId } from '../state/types';
import { STAGES } from '../state/stages';
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
  function handleClick(stageId: StageId) {
    dispatch({ type: 'SET_ACTIVE_STAGE', payload: { stageId } });
  }

  return (
    <div className="w-52 shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Этапы
      </div>
      <ul className="flex-1">
        {STAGES.map((stage) => {
          const status = stageStatus(project, stage.id);
          const stats = statsForStage(project, stage.id);
          const isActive = project.activeStageId === stage.id;

          return (
            <li key={stage.id}>
              <button
                onClick={() => handleClick(stage.id)}
                className={[
                  'w-full text-left px-3 py-2 flex items-center gap-2 border-l-4 text-sm',
                  isActive ? `${stage.bg} ${stage.border} ${stage.text}` : 'border-transparent bg-transparent text-gray-700 hover:bg-gray-100',
                ].join(' ')}
              >
                <span className={`shrink-0 w-4 text-center font-mono text-xs ${statusIconColor(status)}`}>
                  {statusIcon(status)}
                </span>
                <span className="flex-1 truncate">{stage.label}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {stats.total > 0 ? `(${stats.total})` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
