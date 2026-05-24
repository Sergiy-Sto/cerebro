import { Fragment, type ReactNode } from 'react';

interface CardDescriptionProps {
  text: string;
}

// Маркеры уверенности — цветные badges
const CONFIDENCE_MARKERS: Record<string, string> = {
  'факт': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'типовой паттерн': 'bg-blue-100 text-blue-700 border-blue-300',
  'предположение': 'bg-amber-100 text-amber-700 border-amber-300',
  'нужно проверить': 'bg-orange-100 text-orange-700 border-orange-300',
  'user_provided': 'bg-violet-100 text-violet-700 border-violet-300',
  'evidence_supported': 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

/**
 * Рендерит инлайн-контент строки: **bold**, [маркер], URL → кликабельные ссылки.
 */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    // Markdown bold **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    // Confidence marker [text]
    const markerMatch = remaining.match(/\[([^\]]+)\]/);
    // URL
    const urlMatch = remaining.match(/https?:\/\/[^\s,;)]+/);

    // Найти ближайший по позиции
    const matches = [
      boldMatch && { type: 'bold', match: boldMatch, idx: boldMatch.index! },
      markerMatch && { type: 'marker', match: markerMatch, idx: markerMatch.index! },
      urlMatch && { type: 'url', match: urlMatch, idx: urlMatch.index! },
    ].filter(Boolean) as { type: string; match: RegExpMatchArray; idx: number }[];

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    matches.sort((a, b) => a.idx - b.idx);
    const first = matches[0];

    // Текст до совпадения
    if (first.idx > 0) {
      parts.push(remaining.slice(0, first.idx));
    }

    if (first.type === 'bold') {
      parts.push(
        <strong key={`b-${keyCounter++}`} className="font-semibold text-gray-900">
          {first.match[1]}
        </strong>
      );
      remaining = remaining.slice(first.idx + first.match[0].length);
    } else if (first.type === 'marker') {
      const markerText = first.match[1].trim();
      const colorClass = CONFIDENCE_MARKERS[markerText] ?? 'bg-gray-100 text-gray-600 border-gray-300';
      parts.push(
        <span
          key={`m-${keyCounter++}`}
          className={`inline-block text-[10px] font-medium px-1.5 py-0.5 mx-0.5 border ${colorClass} align-middle`}
        >
          {markerText}
        </span>
      );
      remaining = remaining.slice(first.idx + first.match[0].length);
    } else if (first.type === 'url') {
      const url = first.match[0];
      // Короткое отображение: только домен + первый сегмент пути
      let display = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (display.length > 40) {
        const slash = display.indexOf('/');
        const domain = slash >= 0 ? display.slice(0, slash) : display;
        display = domain + '/…';
      }
      parts.push(
        <a
          key={`u-${keyCounter++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 underline decoration-gray-300 hover:decoration-gray-500 text-xs"
          title={url}
        >
          {display}
        </a>
      );
      remaining = remaining.slice(first.idx + url.length);
    }
  }

  return parts;
}

/**
 * Простой markdown-like рендерер для описаний карточек.
 * Поддерживает:
 * - Подзаголовки (строка заканчивается на ":") → font-semibold
 * - Bullet списки (строки начинающиеся с • или - или *) → с отступом
 * - **bold**
 * - Confidence markers [факт], [предположение], etc. → цветные badges
 * - URLs → кликабельные ссылки
 */
export default function CardDescription({ text }: CardDescriptionProps) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let currentList: string[] | null = null;
  let key = 0;

  function flushList() {
    if (currentList && currentList.length > 0) {
      const items = currentList;
      blocks.push(
        <ul key={`list-${key++}`} className="space-y-1.5 my-2 ml-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
              <span className="shrink-0 text-cyan-500 select-none mt-0.5">•</span>
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    // Bullet (• или - или *)
    const bulletMatch = line.match(/^[•\-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList) currentList = [];
      currentList.push(bulletMatch[1]);
      continue;
    }

    flushList();

    // Callout-блок: tail-параграфы анализа (Missing Angles Check, Линейная мысль и т.д.)
    const calloutMatch = line.match(/^(Возможно упустил|Missing Angles|Линейная мысль|Вывод|Заметка|Пробел|Что стоит проверить|Quality Check)[:\s—-]/i);
    if (calloutMatch) {
      const label = calloutMatch[1];
      const rest = line.slice(calloutMatch[0].length).trim();
      blocks.push(
        <div key={`c-${key++}`} className="my-3 pl-3 border-l-2 border-gray-300 bg-gray-50 py-2 pr-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {label}
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            {renderInline(rest)}
          </p>
        </div>
      );
      continue;
    }

    // Подзаголовок: строка заканчивается на ":" (и не слишком длинная)
    if (line.endsWith(':') && line.length < 120) {
      blocks.push(
        <p key={`h-${key++}`} className="text-sm font-semibold text-gray-900 mt-3 mb-1.5 first:mt-0">
          {renderInline(line)}
        </p>
      );
      continue;
    }

    // Обычный абзац
    blocks.push(
      <p key={`p-${key++}`} className="text-sm text-gray-700 leading-relaxed mb-2">
        {renderInline(line)}
      </p>
    );
  }

  flushList();

  return <Fragment>{blocks}</Fragment>;
}
