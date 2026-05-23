import { useState, type Dispatch } from 'react';
import type { Project } from '../state/types';
import type { StoreAction } from '../state/store';
import { validatePastedCards } from '../utils/validation';
import { cardsByStage } from '../state/selectors';
import { newId } from '../utils/id';

interface PasteJsonModalProps {
  project: Project;
  dispatch: Dispatch<StoreAction>;
  onClose: () => void;
}

const PLACEHOLDER = `[
  {
    "type": "hypothesis",
    "title": "Card title",
    "description": "Card description",
    "tags": ["tag1", "tag2"],
    "parentId": null
  }
]`;

export default function PasteJsonModal({ project, dispatch, onClose }: PasteJsonModalProps) {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  function handleImport() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setSummary('Неверный JSON. Проверьте формат.');
      return;
    }

    const result = validatePastedCards(parsed, project.cards);

    // Import valid cards
    result.valid.forEach((parsedCard) => {
      const stageCards = cardsByStage(project, project.activeStageId);
      // We need to account for already-dispatched cards in the same batch:
      // use a sequence based on current max + index in valid array
      const maxNum = stageCards.reduce((m, c) => Math.max(m, c.number), 0);
      const idx = result.valid.indexOf(parsedCard);
      dispatch({
        type: 'ADD_CARD',
        payload: {
          projectId: project.id,
          card: {
            id: newId(),
            number: maxNum + idx + 1,
            stageId: project.activeStageId,
            type: parsedCard.type,
            title: parsedCard.title,
            description: parsedCard.description,
            tags: parsedCard.tags,
            status: 'neutral',
            parentId: parsedCard.parentId,
            createdAt: new Date().toISOString(),
          },
        },
      });
    });

    const total = result.valid.length + result.skipped.length;
    const skipDetails = result.skipped.map((s) => s.reason).join('; ');
    let msg = `Импортировано ${result.valid.length} из ${total}.`;
    if (result.skipped.length > 0) {
      msg += ` Пропущено ${result.skipped.length}: ${skipDetails}`;
    }
    setSummary(msg);
    setImported(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-gray-200 p-5 w-full max-w-xl">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Вставить JSON карточки</h3>
        <p className="text-xs text-gray-500 mb-2">
          Вставьте JSON-массив объектов карточек. Они будут импортированы в текущий этап:{' '}
          <span className="font-medium text-gray-700">{project.activeStageId}</span>
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSummary(null);
            setImported(false);
          }}
          rows={10}
          placeholder={PLACEHOLDER}
          className="w-full border border-gray-300 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mb-3"
        />

        {summary && (
          <div
            className={[
              'text-xs p-2 mb-3 border',
              imported
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700',
            ].join(' ')}
          >
            {summary}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {imported ? 'Закрыть' : 'Отмена'}
          </button>
          {!imported && (
            <button
              onClick={handleImport}
              disabled={!text.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Импортировать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
