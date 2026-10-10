import { CollectionCard } from '../types/mtg';
import { getKnownMedianPrice, getCardFromLocalCache, cardByIdCache } from '../services/api';
import { getCardEffectiveColors, isBasicLandName } from '../utils/deckUtils';

export interface ParsedCsvCard {
  name: string;
  scryfallId?: string;
  set?: string;
  setName?: string;
  collectorNumber?: string;
  scryfallSetId?: string;
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
  const scryfallIdx = colIndexMap.get('idscryfall') ?? colIndexMap.get('scryfallid') ?? colIndexMap.get('scryfall') ?? colIndexMap.get('id') ?? -1;
  const setCodeIdx = colIndexMap.get('setcode') ?? colIndexMap.get('set') ?? colIndexMap.get('editioncode') ?? colIndexMap.get('edition') ?? -1;
  const setNameIdx = colIndexMap.get('setname') ?? colIndexMap.get('editionname') ?? colIndexMap.get('expansion') ?? -1;
  const collectorIdx = colIndexMap.get('collectornumber') ?? colIndexMap.get('cardnumber') ?? colIndexMap.get('number') ?? colIndexMap.get('cn') ?? -1;
  const scryfallSetIdIdx = colIndexMap.get('setscryfallsetid') ?? colIndexMap.get('scryfallsetid') ?? -1;
  const paperIdx = colIndexMap.get('havespaper') ?? colIndexMap.get('paper') ?? colIndexMap.get('quantity') ?? colIndexMap.get('regular') ?? colIndexMap.get('count') ?? colIndexMap.get('qty') ?? -1;
  const foilIdx = colIndexMap.get('havesfoil') ?? colIndexMap.get('foil') ?? -1;
  const etchedIdx = colIndexMap.get('havesetched') ?? colIndexMap.get('etched') ?? -1;

  const results: ParsedCsvCard[] = [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || !cols[nameIdx]) continue;

    const name = cols[nameIdx];
    const rawScryfallId = scryfallIdx >= 0 ? cols[scryfallIdx]?.trim() : undefined;
    const scryfallId = (rawScryfallId && uuidRegex.test(rawScryfallId)) ? rawScryfallId.toLowerCase() : undefined;

    const set = setCodeIdx >= 0 ? cols[setCodeIdx]?.trim().toLowerCase() : undefined;
    const setName = setNameIdx >= 0 ? cols[setNameIdx]?.trim() : undefined;
    const collectorNumber = collectorIdx >= 0 ? cols[collectorIdx]?.trim() : undefined;
    const scryfallSetId = scryfallSetIdIdx >= 0 ? cols[scryfallSetIdIdx]?.trim() : undefined;

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
        scryfallId,
        set,
        setName,
        collectorNumber,
        scryfallSetId,
        quantityRegular: paperQty,
        quantityFoil: totalFoil,
      });
    }
  }

  return results;
}

export function convertParsedCardsToCollectionCards(
  parsed: ParsedCsvCard[],
  binderId: string
): CollectionCard[] {
  const cards: CollectionCard[] = [];
  const now = Date.now();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  parsed.forEach((item, index) => {
    const knownMedian = getKnownMedianPrice(item.name);
    const cached = (item.scryfallId ? cardByIdCache.get(item.scryfallId) : null) || getCardFromLocalCache(item.name);
    const typeLine = cached?.type_line || (isBasicLandName(item.name) ? 'Basic Land' : '');
    const manaCost = cached?.mana_cost || '';
    const colors = cached ? getCardEffectiveColors(cached) : [];
    const colorIdentity = cached?.color_identity || [];
    const cmc = cached?.cmc ?? 0;
    const rarity = cached?.rarity || 'rare';
    const oracleText = cached?.oracle_text || '';
    const effectiveSet = (item.set || cached?.set || '').toLowerCase();
    const effectiveSetName = item.setName || cached?.set_name || '';
    const effectiveCollectorNumber = item.collectorNumber || cached?.collector_number || '';
    const imageUrl = (item.scryfallId && uuidRegex.test(item.scryfallId))
      ? `https://api.scryfall.com/cards/${item.scryfallId}?format=image&version=large`
      : (cached?.image_uris?.large || cached?.image_uris?.normal || '');

    // Non-foil copy
    if (item.quantityRegular > 0) {
      cards.push({
        id: `card-${now}-${index}-reg-${Math.random().toString(36).substr(2, 5)}`,
        binderId,
        scryfallId: item.scryfallId || cached?.id || '',
        imageUrl,
        name: item.name,
        set: effectiveSet,
        setName: effectiveSetName,
        set_name: effectiveSetName,
        collectorNumber: effectiveCollectorNumber,
        collector_number: effectiveCollectorNumber,
        quantity: item.quantityRegular,
        isFoil: false,
        condition: 'NM',
        cmc,
        type_line: typeLine,
        typeLine,
        mana_cost: manaCost,
        manaCost,
        colors,
        color_identity: colorIdentity,
        colorIdentity,
        rarity,
        oracle_text: oracleText,
        oracleText,
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
        scryfallId: item.scryfallId || cached?.id || '',
        imageUrl,
        name: item.name,
        set: effectiveSet,
        setName: effectiveSetName,
        set_name: effectiveSetName,
        collectorNumber: effectiveCollectorNumber,
        collector_number: effectiveCollectorNumber,
        quantity: item.quantityFoil,
        isFoil: true,
        condition: 'NM',
        cmc,
        type_line: typeLine,
        typeLine,
        mana_cost: manaCost,
        manaCost,
        colors,
        color_identity: colorIdentity,
        colorIdentity,
        rarity,
        oracle_text: oracleText,
        oracleText,
        currentPriceUsd: knownMedian,
        medianPriceUsd: knownMedian,
        isPriceEstimated: Boolean(knownMedian),
        addedAt: now,
      });
    }
  });

  return cards;
}
