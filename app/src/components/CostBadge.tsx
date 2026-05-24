import { useState, useEffect } from 'react';
import { totalCostToday } from '../utils/costLog';
import CostModal from './CostModal';

function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export default function CostBadge() {
  const [today, setToday] = useState(() => totalCostToday());
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    function update() { setToday(totalCostToday()); }
    window.addEventListener('cerebro:cost-log-updated', update);
    // Также периодически обновлять — на случай новой даты
    const interval = setInterval(update, 30_000);
    return () => {
      window.removeEventListener('cerebro:cost-log-updated', update);
      clearInterval(interval);
    };
  }, []);

  const color = today > 5 ? 'text-red-600 bg-red-50 border-red-300'
              : today > 1 ? 'text-amber-600 bg-amber-50 border-amber-300'
              : 'text-gray-600 bg-gray-50 border-gray-300';

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        title={`Расходы за сегодня: ${fmtUsd(today)}. Клик — детальный breakdown.`}
        className={`px-2 py-1.5 text-xs border font-mono hover:brightness-95 ${color}`}
      >
        💰 {fmtUsd(today)}
      </button>
      {showModal && <CostModal onClose={() => setShowModal(false)} />}
    </>
  );
}
