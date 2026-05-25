import type { Card, CardType } from '../state/types';

const VALID_CARD_TYPES: CardType[] = [
  'observation_item',
  'search_finding',
  'dimension',
  'obligatory_feature',
  'accidental_feature',
  'job',
  'actor',
  'substitute',
  'boundary_case',
  'transformation_handle',
  'friction_point',
  'contradiction',
  'cross_field_analogy',
  'opportunity_branch',
  'hypothesis',
  'critique',
  'validation_test',
];

export interface ParsedCard {
  type: CardType;
  title: string;
  description: string;
  tags: string[];
  parentId: string | null;
}

export interface ValidationResult {
  valid: ParsedCard[];
  skipped: { item: unknown; reason: string }[];
}

export function validatePastedCards(
  raw: unknown,
  existingCards: Card[]
): ValidationResult {
  const valid: ParsedCard[] = [];
  const skipped: { item: unknown; reason: string }[] = [];

  if (!Array.isArray(raw)) {
    return { valid: [], skipped: [{ item: raw, reason: 'Input must be a JSON array' }] };
  }

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      skipped.push({ item, reason: 'Item must be an object' });
      continue;
    }

    const obj = item as Record<string, unknown>;

    if (!obj.type || !VALID_CARD_TYPES.includes(obj.type as CardType)) {
      skipped.push({ item, reason: `Invalid or missing "type". Must be one of: ${VALID_CARD_TYPES.join(', ')}` });
      continue;
    }

    if (typeof obj.title !== 'string' || obj.title.trim() === '') {
      skipped.push({ item, reason: 'Missing or empty "title" string' });
      continue;
    }

    if (typeof obj.description !== 'string' || obj.description.trim() === '') {
      skipped.push({ item, reason: 'Missing or empty "description" string' });
      continue;
    }

    let tags: string[] = [];
    if (Array.isArray(obj.tags)) {
      tags = obj.tags.filter((t): t is string => typeof t === 'string');
    }

    let parentId: string | null = null;
    if (obj.parentId !== undefined && obj.parentId !== null) {
      if (typeof obj.parentId !== 'string') {
        skipped.push({ item, reason: '"parentId" must be a string or null' });
        continue;
      }
      const parentExists = existingCards.some((c) => c.id === obj.parentId);
      if (!parentExists) {
        // skip with warning but still include the card without parentId
        skipped.push({ item, reason: `parentId "${obj.parentId}" not found — imported without parent link` });
        parentId = null;
        valid.push({
          type: obj.type as CardType,
          title: obj.title.trim(),
          description: obj.description.trim(),
          tags,
          parentId,
        });
        continue;
      }
      parentId = obj.parentId;
    }

    valid.push({
      type: obj.type as CardType,
      title: obj.title.trim(),
      description: obj.description.trim(),
      tags,
      parentId,
    });
  }

  return { valid, skipped };
}
