import { useState } from 'react';
import { breakdown, totalCostToday, totalCostAll, clearCostLog, type CostBreakdown } from '../utils/costLog';

interface CostModalProps {
  onClose: () => void;
}

type GroupBy = 'stage' | 'model' | 'project';
type Period = 'today' | 'all';

function fmtUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function CostModal({ onClose }: CostModalProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('stage');
  const [period, setPeriod] = useState<Period>('today');
  const [, force] = useState(0);

  const since = period === 'today' ? (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() : undefined;
  const data: CostBreakdown[] = breakdown(groupBy, since ? { since } : undefined);
  const total = data.reduce((s, x) => s + x.cost, 0);

  const todayTotal = totalCostToday();
  const allTotal = totalCostAll();

  function handleClear() {
    if (window.confirm('Очистить весь cost log? Действие необратимо.')) {
      clearCostLog();
      force((x) => x + 1);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">💰 Cost log</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Сегодня: <strong>{fmtUsd(todayTotal)}</strong> · Всё время: <strong>{fmtUsd(allTotal)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">×</button>
        </div>

        {/* Controls */}
        <div className="px-5 py-2 border-b border-gray-200 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Период:</span>
            <button
              onClick={() => setPeriod('today')}
              className={`px-2 py-1 ${period === 'today' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >Сегодня</button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-2 py-1 ${period === 'all' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >Всё время</button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Группировать по:</span>
            <button
              onClick={() => setGroupBy('stage')}
              className={`px-2 py-1 ${groupBy === 'stage' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >Стейджу</button>
            <button
              onClick={() => setGroupBy('model')}
              className={`px-2 py-1 ${groupBy === 'model' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >Модели</button>
            <button
              onClick={() => setGroupBy('project')}
              className={`px-2 py-1 ${groupBy === 'project' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >Проекту</button>
          </div>
          <div className="ml-auto">
            <button
              onClick={handleClear}
              className="px-2 py-1 text-red-600 hover:bg-red-50 border border-red-200"
            >Очистить лог</button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {data.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">Логов нет за выбранный период</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{groupBy === 'stage' ? 'Стейдж' : groupBy === 'model' ? 'Модель' : 'Проект'}</th>
                  <th className="text-right px-3 py-2 font-medium">Вызовов</th>
                  <th className="text-right px-3 py-2 font-medium">Input</th>
                  <th className="text-right px-3 py-2 font-medium">Output</th>
                  <th className="text-right px-3 py-2 font-medium">🌐</th>
                  <th className="text-right px-4 py-2 font-medium">Стоимость</th>
                  <th className="text-right px-3 py-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const pct = total > 0 ? (row.cost / total) * 100 : 0;
                  return (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{row.key}</td>
                      <td className="text-right px-3 py-2 text-gray-600 font-mono">{row.calls}</td>
                      <td className="text-right px-3 py-2 text-gray-600 font-mono">{fmtTokens(row.inputTokens)}</td>
                      <td className="text-right px-3 py-2 text-gray-600 font-mono">{fmtTokens(row.outputTokens)}</td>
                      <td className="text-right px-3 py-2 text-cyan-600 font-mono">{row.webSearchCalls || ''}</td>
                      <td className="text-right px-4 py-2 font-semibold text-gray-900 font-mono">{fmtUsd(row.cost)}</td>
                      <td className="text-right px-3 py-2 text-gray-500 font-mono">{pct.toFixed(0)}%</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-2">Итого</td>
                  <td className="text-right px-3 py-2 font-mono">{data.reduce((s, r) => s + r.calls, 0)}</td>
                  <td className="text-right px-3 py-2 font-mono">{fmtTokens(data.reduce((s, r) => s + r.inputTokens, 0))}</td>
                  <td className="text-right px-3 py-2 font-mono">{fmtTokens(data.reduce((s, r) => s + r.outputTokens, 0))}</td>
                  <td className="text-right px-3 py-2 font-mono text-cyan-700">{data.reduce((s, r) => s + r.webSearchCalls, 0) || ''}</td>
                  <td className="text-right px-4 py-2 font-mono">{fmtUsd(total)}</td>
                  <td className="text-right px-3 py-2 font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Footer note */}
        <div className="px-5 py-2 border-t border-gray-200 text-[10px] text-gray-400">
          Стоимость оценочная — по прайс-листу <code>utils/pricing.ts</code>. Точные суммы — в OpenAI Dashboard.
        </div>
      </div>
    </div>
  );
}
