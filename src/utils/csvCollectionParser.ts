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
  rarity?: string;
  quantityRegular: number;
  quantityFoil: number; // Includes both Foil and Etched
}

export function parseCollectionCsv(csvText: string): ParsedCsvCard[] {
  if (!csvText || !csvText.trim()) return [];

  // Remove potential UTF-8 BOM
  const cleanedCsv = csvText.replace(/^\uFEFF/, '');
  const lines = cleanedCsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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

  // Identify column indices with exhaustive aliases
  const nameIdx = colIndexMap.get('oraclename') ?? colIndexMap.get('cardname') ?? colIndexMap.get('name') ?? 0;
  const scryfallIdx = colIndexMap.get('idscryfall')
    ?? colIndexMap.get('scryfallid')
    ?? colIndexMap.get('scryfallcardid')
    ?? colIndexMap.get('cardid')
    ?? colIndexMap.get('scryfall')
    ?? colIndexMap.get('scryfalluuid')
    ?? colIndexMap.get('carduuid')
    ?? colIndexMap.get('uuid')
    ?? colIndexMap.get('id')
    ?? -1;
  const setCodeIdx = colIndexMap.get('setcode') ?? colIndexMap.get('set') ?? colIndexMap.get('editioncode') ?? colIndexMap.get('edition') ?? -1;
  const setNameIdx = colIndexMap.get('setname') ?? colIndexMap.get('editionname') ?? colIndexMap.get('expansion') ?? -1;
  const collectorIdx = colIndexMap.get('collectornumber') ?? colIndexMap.get('cardnumber') ?? colIndexMap.get('number') ?? colIndexMap.get('cn') ?? -1;
  const scryfallSetIdIdx = colIndexMap.get('setscryfallsetid') ?? colIndexMap.get('scryfallsetid') ?? -1;
  const rarityIdx = colIndexMap.get('rarity') ?? colIndexMap.get('cardrarity') ?? colIndexMap.get('r') ?? -1;

  // Specific finish quantity columns
  const normalIdx = colIndexMap.get('normal')
    ?? colIndexMap.get('nonfoil')
    ?? colIndexMap.get('regular')
    ?? colIndexMap.get('paper')
    ?? colIndexMap.get('havespaper')
    ?? colIndexMap.get('havenormal')
    ?? colIndexMap.get('haveregular')
    ?? colIndexMap.get('regularquantity')
    ?? colIndexMap.get('normalquantity')
    ?? colIndexMap.get('quantitynormal')
    ?? colIndexMap.get('quantityregular')
    ?? colIndexMap.get('regularcount')
    ?? colIndexMap.get('normalcount')
    ?? -1;

  const etchedIdx = colIndexMap.get('etched')
    ?? colIndexMap.get('foiletched')
    ?? colIndexMap.get('etchedfoil')
    ?? colIndexMap.get('havesetched')
    ?? colIndexMap.get('haveetched')
    ?? colIndexMap.get('etchedquantity')
    ?? colIndexMap.get('quantityetched')
    ?? colIndexMap.get('etchedcount')
    ?? -1;

  const foilIdx = colIndexMap.get('havesfoil')
    ?? colIndexMap.get('havefoil')
    ?? colIndexMap.get('foilquantity')
    ?? colIndexMap.get('quantityfoil')
    ?? colIndexMap.get('foilcount')
    ?? colIndexMap.get('foils')
    ?? (colIndexMap.has('foil') && colIndexMap.get('foil') !== normalIdx && colIndexMap.get('foil') !== etchedIdx ? colIndexMap.get('foil')! : -1);

  // Standalone generic quantity column (e.g. "Quantity", "Count", "Qty")
  const genericQtyIdx = colIndexMap.get('quantity')
    ?? colIndexMap.get('count')
    ?? colIndexMap.get('qty')
    ?? colIndexMap.get('amount')
    ?? colIndexMap.get('total')
    ?? colIndexMap.get('haves')
    ?? colIndexMap.get('have')
    ?? -1;

  // Standalone finish / treatment column (e.g. "Finish", "Printing", "Treatment")
  const finishIdx = colIndexMap.get('finish')
    ?? colIndexMap.get('printing')
    ?? colIndexMap.get('treatment')
    ?? colIndexMap.get('finishes')
    ?? -1;

  const hasSpecificFinishColumns = normalIdx >= 0 || etchedIdx >= 0 || (foilIdx >= 0 && foilIdx !== genericQtyIdx);
  const hasGenericQty = genericQtyIdx >= 0;

  const results: ParsedCsvCard[] = [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || !cols[nameIdx]) continue;

    const name = cols[nameIdx];
    let rawScryfallId = scryfallIdx >= 0 ? cols[scryfallIdx]?.trim() : undefined;
    if (rawScryfallId) {
      rawScryfallId = rawScryfallId.replace(/^["']|["']$/g, '').trim();
    }

    // Fallback: If designated column is not a valid UUID, search all columns in this row for a valid UUID
    if (!rawScryfallId || !uuidRegex.test(rawScryfallId)) {
      const foundCol = cols.find((val) => {
        const cleanVal = (val || '').replace(/^["']|["']$/g, '').trim();
        return uuidRegex.test(cleanVal);
      });
      if (foundCol) {
        rawScryfallId = foundCol.replace(/^["']|["']$/g, '').trim();
      }
    }

    const scryfallId = (rawScryfallId && uuidRegex.test(rawScryfallId)) ? rawScryfallId.toLowerCase() : undefined;

    const set = setCodeIdx >= 0 ? cols[setCodeIdx]?.trim().toLowerCase() : undefined;
    const setName = setNameIdx >= 0 ? cols[setNameIdx]?.trim() : undefined;
    const collectorNumber = collectorIdx >= 0 ? cols[collectorIdx]?.trim() : undefined;
    const scryfallSetId = scryfallSetIdIdx >= 0 ? cols[scryfallSetIdIdx]?.trim() : undefined;

    let parsedRarity: string | undefined = undefined;
    if (rarityIdx >= 0 && cols[rarityIdx]) {
      const rawR = cols[rarityIdx].trim().toLowerCase();
      if (rawR.startsWith('m')) parsedRarity = 'mythic';
      else if (rawR.startsWith('r')) parsedRarity = 'rare';
      else if (rawR.startsWith('u')) parsedRarity = 'uncommon';
      else if (rawR.startsWith('c')) parsedRarity = 'common';
      else if (rawR.startsWith('s')) parsedRarity = 'special';
      else if (rawR.startsWith('b')) parsedRarity = 'bonus';
    }

    let paperQty = 0;
    let foilQty = 0;
    let etchedQty = 0;

    if (hasSpecificFinishColumns) {
      if (normalIdx >= 0) {
        const raw = parseInt(cols[normalIdx] || '0', 10);
        paperQty = isNaN(raw) ? 0 : Math.max(0, raw);
      } else if (!hasGenericQty) {
        paperQty = 0;
      }

      if (etchedIdx >= 0) {
        const raw = parseInt(cols[etchedIdx] || '0', 10);
        etchedQty = isNaN(raw) ? 0 : Math.max(0, raw);
      }

      if (foilIdx >= 0 && foilIdx !== normalIdx && foilIdx !== etchedIdx) {
        const rawStr = (cols[foilIdx] || '').trim().toLowerCase();
        const raw = parseInt(rawStr || '0', 10);
        if (!isNaN(raw) && !rawStr.includes('etched') && !rawStr.includes('foil')) {
          foilQty = Math.max(0, raw);
        } else if (rawStr.includes('etched')) {
          if (etchedIdx < 0) {
            etchedQty = hasGenericQty ? (parseInt(cols[genericQtyIdx] || '0', 10) || 1) : 1;
          }
        } else if (rawStr.includes('foil') || rawStr === 'true' || rawStr === 'yes' || rawStr === '1') {
          foilQty = hasGenericQty ? (parseInt(cols[genericQtyIdx] || '0', 10) || 1) : 1;
        }
      }

      if (hasGenericQty && normalIdx < 0 && etchedQty === 0 && foilQty === 0) {
        const raw = parseInt(cols[genericQtyIdx] || '0', 10);
        const qty = isNaN(raw) ? 0 : Math.max(0, raw);
        const effectiveFinishCol = finishIdx >= 0 ? finishIdx : foilIdx;
        const finishVal = (effectiveFinishCol >= 0 ? (cols[effectiveFinishCol] || '') : '').trim().toLowerCase();
        if (finishVal.includes('etched')) {
          etchedQty = qty;
        } else if (finishVal.includes('foil') || finishVal === 'true' || finishVal === 'yes') {
          foilQty = qty;
        } else {
          paperQty = qty;
        }
      }
    } else if (hasGenericQty) {
      const raw = parseInt(cols[genericQtyIdx] || '0', 10);
      const qty = isNaN(raw) ? 0 : Math.max(0, raw);

      if (qty > 0) {
        const effectiveFinishCol = finishIdx >= 0 ? finishIdx : (colIndexMap.get('foil') ?? -1);
        const finishVal = (effectiveFinishCol >= 0 ? (cols[effectiveFinishCol] || '') : '').trim().toLowerCase();
        const isEtched = finishVal.includes('etched');
        const isFoil = !isEtched && (
          finishVal.includes('foil') ||
          finishVal === 'true' ||
          finishVal === 'yes' ||
          finishVal === '1'
        );

        if (isEtched) {
          etchedQty = qty;
        } else if (isFoil) {
          foilQty = qty;
        } else {
          paperQty = qty;
        }
      }
    } else {
      paperQty = 1;
    }

    const totalFoil = foilQty + etchedQty;

    // If a card has 0 in all quantities in the file, don't import it!
    if (paperQty <= 0 && totalFoil <= 0) {
      continue;
    }

    results.push({
      name,
      scryfallId,
      set,
      setName,
      collectorNumber,
      scryfallSetId,
      rarity: parsedRarity,
      quantityRegular: paperQty,
      quantityFoil: totalFoil,
    });
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
    const cachedById = (item.scryfallId && uuidRegex.test(item.scryfallId)) ? cardByIdCache.get(item.scryfallId) : null;
    const cachedByName = getCardFromLocalCache(item.name);
    const cached = cachedById || cachedByName;
    const typeLine = cached?.type_line || (isBasicLandName(item.name) ? 'Basic Land' : '');
    const manaCost = cached?.mana_cost || '';
    const colors = cached ? getCardEffectiveColors(cached) : [];
    const colorIdentity = cached?.color_identity || [];
    const cmc = cached?.cmc ?? 0;
    const rarity = (item.rarity as any) || cachedById?.rarity || cachedByName?.rarity || (isBasicLandName(item.name) ? 'common' : 'common');
    const oracleText = cached?.oracle_text || '';

    // If an exact Scryfall ID was matched in cache, use its authoritative edition attributes.
    // NEVER borrow an arbitrary edition's set, collector number, or scryfall ID from generic name cache!
    const isExactCached = Boolean(cachedById);
    const effectiveSet = (isExactCached ? (cachedById?.set || '').toLowerCase() : (item.set || '').toLowerCase());
    const effectiveSetName = (isExactCached ? (cachedById?.set_name || cachedById?.set || '') : (item.setName || (item.set ? item.set.toUpperCase() : '')));
    const effectiveCollectorNumber = isExactCached ? String(cachedById?.collector_number || '') : (item.collectorNumber || '');
    const effectiveScryfallId = item.scryfallId || (isExactCached ? (cachedById?.id || '') : '');
    const imageUrl = (effectiveScryfallId && uuidRegex.test(effectiveScryfallId))
      ? `https://api.scryfall.com/cards/${effectiveScryfallId}?format=image&version=large`
      : (isExactCached ? (cachedById?.image_uris?.large || cachedById?.image_uris?.normal || '') : '');

    // Non-foil copy
    if (item.quantityRegular > 0) {
      cards.push({
        id: `card-${now}-${index}-reg-${Math.random().toString(36).substr(2, 5)}`,
        binderId,
        scryfallId: effectiveScryfallId,
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
        scryfallId: effectiveScryfallId,
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
