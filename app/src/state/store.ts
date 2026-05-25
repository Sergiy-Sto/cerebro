import { useReducer, useEffect, type Dispatch } from 'react';
import type { AppState, Card, Project, StageId } from './types';

const STORAGE_KEY = 'creative_core_workbench_v1';

const initialState: AppState = {
  projects: [],
  activeProjectId: null,
};

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as AppState;
    return migrate(parsed);
  } catch {
    return initialState;
  }
}

/**
 * Миграции state при загрузке.
 * Применяются однократно при чтении из localStorage.
 */
function migrate(state: AppState): AppState {
  let mutated = false;
  for (const project of state.projects) {
    for (const card of project.cards) {
      // 2026-05-26: 1.7 Failure Modes удалён — карточки переносятся в 3.1 Friction (Friction Map)
      // (они концептуально дублировались)
      if ((card.stageId as string) === 'failure_modes') {
        (card as any).stageId = 'friction';
        if ((card.type as string) === 'failure_mode') {
          (card as any).type = 'friction_point';
        }
        mutated = true;
      }
    }
    // Если активный стейдж был на failure_modes — переключаем на friction
    if ((project.activeStageId as string) === 'failure_modes') {
      (project as any).activeStageId = 'friction';
      mutated = true;
    }
  }
  if (mutated) {
    // Сохраним мигрированный state обратно (в фоне)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }
  return state;
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

type Action =
  | { type: 'CREATE_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: { id: string } }
  | { type: 'SET_ACTIVE_PROJECT'; payload: { id: string } }
  | { type: 'SET_ACTIVE_STAGE'; payload: { stageId: StageId } }
  | { type: 'SET_SELECTED_CARD'; payload: { cardId: string | null } }
  | { type: 'ADD_CARD'; payload: { projectId: string; card: Card } }
  | { type: 'UPDATE_CARD'; payload: { projectId: string; card: Card } }
  | { type: 'DELETE_CARD'; payload: { projectId: string; cardId: string } };

function updateProjectInState(
  state: AppState,
  projectId: string,
  updater: (p: Project) => Project
): AppState {
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.id === projectId ? updater(p) : p
    ),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'CREATE_PROJECT':
      return {
        ...state,
        projects: [...state.projects, action.payload],
        activeProjectId: action.payload.id,
      };

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'DELETE_PROJECT': {
      const remaining = state.projects.filter((p) => p.id !== action.payload.id);
      return {
        ...state,
        projects: remaining,
        activeProjectId:
          state.activeProjectId === action.payload.id
            ? null
            : state.activeProjectId,
      };
    }

    case 'SET_ACTIVE_PROJECT':
      return {
        ...state,
        activeProjectId: action.payload.id,
      };

    case 'SET_ACTIVE_STAGE': {
      if (!state.activeProjectId) return state;
      return updateProjectInState(state, state.activeProjectId, (p) => ({
        ...p,
        activeStageId: action.payload.stageId,
        // selectedCardId НЕ сбрасываем — пользователь может читать карточку пока streamятся новые
        // стадии (включая переключение во время auto-all). Сам выберет другую когда захочет.
      }));
    }

    case 'SET_SELECTED_CARD': {
      if (!state.activeProjectId) return state;
      return updateProjectInState(state, state.activeProjectId, (p) => ({
        ...p,
        selectedCardId: action.payload.cardId,
      }));
    }

    case 'ADD_CARD':
      return updateProjectInState(state, action.payload.projectId, (p) => {
        // Defensive dedup: если карточка с таким же title уже есть в этом stage —
        // отбрасываем. Это страховка от race conditions (двойная генерация).
        // Title — достаточно стабильный ключ; description может отличаться даже
        // при дубле, но title обычно одинаковый.
        const newCard = action.payload.card;
        const isDuplicate = p.cards.some(
          (c) =>
            c.stageId === newCard.stageId &&
            c.title.trim().toLowerCase() === newCard.title.trim().toLowerCase()
        );
        if (isDuplicate) {
          // тихо отбрасываем дубль — не ломаем поток генерации, просто игнорим
          return p;
        }
        return {
          ...p,
          cards: [...p.cards, newCard],
          updatedAt: new Date().toISOString(),
        };
      });

    case 'UPDATE_CARD':
      return updateProjectInState(state, action.payload.projectId, (p) => ({
        ...p,
        cards: p.cards.map((c) =>
          c.id === action.payload.card.id ? action.payload.card : c
        ),
        updatedAt: new Date().toISOString(),
      }));

    case 'DELETE_CARD':
      return updateProjectInState(state, action.payload.projectId, (p) => ({
        ...p,
        cards: p.cards.filter((c) => c.id !== action.payload.cardId),
        selectedCardId:
          p.selectedCardId === action.payload.cardId ? null : p.selectedCardId,
        updatedAt: new Date().toISOString(),
      }));

    default:
      return state;
  }
}

export type StoreAction = Action;

export function useStore(): [AppState, Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return [state, dispatch];
}
