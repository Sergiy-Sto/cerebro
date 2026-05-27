import { useState, type Dispatch } from 'react';
import type { AppState, MethodologyMode, Project } from '../state/types';
import type { StoreAction } from '../state/store';
import { newId } from '../utils/id';
import { FIRST_STAGE_ID } from '../state/stages';
import ProjectForm from './ProjectForm';
import ConfirmDialog from '../components/ConfirmDialog';

interface ProjectPickerProps {
  state: AppState;
  dispatch: Dispatch<StoreAction>;
}

export default function ProjectPicker({ state, dispatch }: ProjectPickerProps) {
  const [showNewForm, setShowNewForm] = useState(state.projects.length === 0);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { projects } = state;

  function handleCreate(data: { title: string; frame: string; constraints: string[]; criteria: string[]; methodologyMode: MethodologyMode }) {
    const now = new Date().toISOString();
    const project: Project = {
      id: newId(),
      title: data.title,
      frame: data.frame,
      constraints: data.constraints,
      criteria: data.criteria,
      cards: [],
      activeStageId: FIRST_STAGE_ID,
      selectedCardId: null,
      createdAt: now,
      updatedAt: now,
      methodologyMode: data.methodologyMode,
    };
    dispatch({ type: 'CREATE_PROJECT', payload: project });
    setShowNewForm(false);
  }

  function handleOpen(id: string) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id } });
  }

  function handleDeleteConfirm() {
    if (deleteTargetId) {
      dispatch({ type: 'DELETE_PROJECT', payload: { id: deleteTargetId } });
      setDeleteTargetId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-lg">
          <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">Creative Core Workbench</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">Проектов пока нет. Создайте первый.</p>
          <ProjectForm
            onSave={handleCreate}
            onCancel={() => {}}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Creative Core Workbench</h1>
            <p className="text-xs text-gray-500 mt-0.5">{projects.length} {projects.length === 1 ? 'проект' : projects.length < 5 ? 'проекта' : 'проектов'}</p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700"
          >
            + Новый проект
          </button>
        </div>

        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="bg-white border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{p.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{p.frame}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {p.cards.length} {p.cards.length === 1 ? 'карточка' : p.cards.length < 5 ? 'карточки' : 'карточек'} ·{' '}
                    Этап: {p.activeStageId.replace(/_/g, ' ')} ·{' '}
                    Обновлён {new Date(p.updatedAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleOpen(p.id)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Открыть
                  </button>
                  <button
                    onClick={() => setDeleteTargetId(p.id)}
                    className="px-3 py-1 text-xs border border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {showNewForm && (
        <ProjectForm
          onSave={handleCreate}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {deleteTargetId && (
        <ConfirmDialog
          message={`Удалить проект «${projects.find((p) => p.id === deleteTargetId)?.title}»? Все карточки будут потеряны.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  );
}
