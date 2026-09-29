import { CollectionCard } from '../types/mtg';

export interface ParsedCsvCard {
  name: string;
  scryfallId?: string;
  quantityRegular: number;
  quantityFoil: number; // Includes both Foil and Etched
}

export function parseCollectionCsv(csvText: string): ParsedCsvCard[] {
  if (!csvText || !csvText.trim()) return [];

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Parse CSV line taking quotes into account
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headerRow = parseLine(lines[0]);
  const colIndexMap = new Map<string, number>();
  headerRow.forEach((col, idx) => {
    const clean = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    colIndexMap.set(clean, idx);
  });

  // Identify column indices
  const nameIdx = colIndexMap.get('oraclename') ?? colIndexMap.get('cardname') ?? colIndexMap.get('name') ?? 0;
  const scryfallIdx = colIndexMap.get('idscryfall') ?? colIndexMap.get('scryfallid') ?? colIndexMap.get('scryfall') ?? -1;
  const paperIdx = colIndexMap.get('havespaper') ?? colIndexMap.get('paper') ?? colIndexMap.get('quantity') ?? colIndexMap.get('regular') ?? -1;
  const foilIdx = colIndexMap.get('havesfoil') ?? colIndexMap.get('foil') ?? -1;
  const etchedIdx = colIndexMap.get('havesetched') ?? colIndexMap.get('etched') ?? -1;

  const results: ParsedCsvCard[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || !cols[nameIdx]) continue;

    const name = cols[nameIdx];
    const scryfallId = scryfallIdx >= 0 ? cols[scryfallIdx] : undefined;

    let paperQty = 0;
    if (paperIdx >= 0) {
      paperQty = parseInt(cols[paperIdx] || '0', 10) || 0;
    } else {
      paperQty = 1;
    }

    const foilQty = foilIdx >= 0 ? (parseInt(cols[foilIdx] || '0', 10) || 0) : 0;
    const etchedQty = etchedIdx >= 0 ? (parseInt(cols[etchedIdx] || '0', 10) || 0) : 0;
    // Treat Etched as Foil quantity
    const totalFoil = foilQty + etchedQty;

    if (paperQty > 0 || totalFoil > 0) {
      results.push({
        name,
        scryfallId: scryfallId || undefined,
        quantityRegular: paperQty,
        quantityFoil: totalFoil,
      });
    }
  }

  return results;
}

import { getKnownMedianPrice } from '../services/scryfall';

export function convertParsedCardsToCollectionCards(
  parsed: ParsedCsvCard[],
  binderId: string
): CollectionCard[] {
  const cards: CollectionCard[] = [];
  const now = Date.now();

  parsed.forEach((item, index) => {
    const knownMedian = getKnownMedianPrice(item.name);
    // Non-foil copy
    if (item.quantityRegular > 0) {
      cards.push({
        id: `card-${now}-${index}-reg-${Math.random().toString(36).substr(2, 5)}`,
        binderId,
        scryfallId: item.scryfallId || '',
        imageUrl: item.scryfallId ? `https://api.scryfall.com/cards/${item.scryfallId}?format=image&version=large` : '',
        name: item.name,
        set: '',
        setName: '',
        collectorNumber: '',
        quantity: item.quantityRegular,
        isFoil: false,
        condition: 'NM',
        cmc: 0,
        type_line: '',
        rarity: 'rare',
        currentPriceUsd: knownMedian,
        medianPriceUsd: knownMedian,
        isPriceEstimated: Boolean(knownMedian),
        addedAt: now,
      });
    }

    // Foil copy (including etched)
    if (item.quantityFoil > 0) {
      cards.push({
        id: `card-${now}-${index}-foil-${Math.random().toString(36).substr(2, 5)}`,
        binderId,
        scryfallId: item.scryfallId || '',
        imageUrl: item.scryfallId ? `https://api.scryfall.com/cards/${item.scryfallId}?format=image&version=large` : '',
        name: item.name,
        set: '',
        setName: '',
        collectorNumber: '',
        quantity: item.quantityFoil,
        isFoil: true,
        condition: 'NM',
        cmc: 0,
        type_line: '',
        rarity: 'rare',
        currentPriceUsd: knownMedian,
        medianPriceUsd: knownMedian,
        isPriceEstimated: Boolean(knownMedian),
        addedAt: now,
      });
    }
  });

  return cards;
}
