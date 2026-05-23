import { useState } from 'react';
import { getApiKey, saveApiKey } from '../utils/openai';

interface ApiKeyModalProps {
  onClose: () => void;
}

export default function ApiKeyModal({ onClose }: ApiKeyModalProps) {
  const [value, setValue] = useState(getApiKey());
  const [saved, setSaved] = useState(false);

  function handleSave() {
    saveApiKey(value);
    setSaved(true);
    setTimeout(onClose, 600);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md mx-4 p-6 shadow-lg">
        <h2 className="text-base font-semibold text-gray-900 mb-1">OpenAI API ключ</h2>
        <p className="text-xs text-gray-500 mb-4">
          Хранится только в localStorage браузера. Никуда не отправляется, кроме OpenAI.
        </p>
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder="sk-..."
          className="w-full border border-gray-300 px-3 py-2 text-sm font-mono mb-4 focus:outline-none focus:border-blue-400"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-1.5 text-xs text-white ${saved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saved ? '✓ Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
