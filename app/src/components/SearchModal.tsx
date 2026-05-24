import { useEffect, useState } from 'react';
import type { Card, Project } from '../state/types';
import { generateSearchQueries, getApiKey } from '../utils/openai';

interface SearchModalProps {
  project: Project;
  observationCards: Card[];
  model: string;
  onClose: () => void;
}

export default function SearchModal({ project, observationCards, model, onClose }: SearchModalProps) {
  const [queries, setQueries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError('Нет API-ключа');
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    generateSearchQueries(project, observationCards, apiKey, model)
      .then((qs) => {
        if (cancelled) return;
        setQueries(qs);
        setIsLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Ошибка генерации запросов');
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openInGoogle(query: string) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  }

  function openAll() {
    queries.forEach((q, idx) => {
      // small stagger так браузер не блокирует
      setTimeout(() => openInGoogle(q), idx * 150);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white max-w-xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">🔍 Поиск в интернете</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Запросы сгенерированы по Observation Scan. Кликни — откроется Google.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <p className="text-sm text-gray-500 text-center py-8">⏳ Формирую запросы…</p>
          )}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {!isLoading && !error && queries.length === 0 && (
            <p className="text-sm text-gray-500">Не удалось сформировать запросы. Попробуй ещё раз.</p>
          )}
          {!isLoading && queries.length > 0 && (
            <ul className="space-y-2">
              {queries.map((q, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => openInGoogle(q)}
                    className="w-full text-left px-3 py-2 border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-sm transition-colors flex items-center gap-2"
                  >
                    <span className="text-xs text-gray-400 shrink-0">#{idx + 1}</span>
                    <span className="text-blue-700 font-mono text-xs flex-1">{q}</span>
                    <span className="text-xs text-gray-400">↗</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {!isLoading && queries.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              💡 Найденное копируй в Search Notes (следующий этап)
            </p>
            <button
              onClick={openAll}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              Открыть все ({queries.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
