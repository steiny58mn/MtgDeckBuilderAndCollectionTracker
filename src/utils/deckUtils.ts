export function detectCardManaProduction(card: DeckCard, commanderColors: string[] = ['W', 'U', 'B', 'R', 'G']): string[] {
  const rawProduced = (card as any).produced_mana || (card as any).producedMana;
  if (Array.isArray(rawProduced) && rawProduced.length > 0) {
    return Array.from(new Set(rawProduced.map((c: string) => c.toUpperCase())));
  }

  const name = (card.name || '').toLowerCase();
  const typeLine = (card.type_line || (card as any).typeLine || '').toLowerCase();
  const oracleText = (card.oracle_text || (card as any).oracleText || '').toLowerCase();

  const isLand = typeLine.includes('land');
  const isManaProducer = isLand || oracleText.includes('add ') || oracleText.includes('{t}: add');
  if (!isManaProducer) return [];

  const produced: Set<string> = new Set();

  // Basic lands
  if (name.includes('plains')) produced.add('W');
  if (name.includes('island')) produced.add('U');
  if (name.includes('swamp')) produced.add('B');
  if (name.includes('mountain')) produced.add('R');
  if (name.includes('forest')) produced.add('G');
  if (name.includes('wastes')) produced.add('C');

  // Any color lands / rocks
  if (
    oracleText.includes('any color') ||
    oracleText.includes('any one color') ||
    oracleText.includes('mana of any color') ||
    name.includes('command tower') ||
    name.includes('city of brass') ||
    name.includes('mana confluence') ||
    name.includes('exotic orchard') ||
    name.includes('reflecting pool') ||
    name.includes('birds of paradise') ||
    name.includes('arcane signet')
  ) {
    commanderColors.forEach((c) => produced.add(c));
  }

  // Fetchlands
  if (oracleText.includes('search your library for a plains')) produced.add('W');
  if (oracleText.includes('search your library for an island')) produced.add('U');
  if (oracleText.includes('search your library for a swamp')) produced.add('B');
  if (oracleText.includes('search your library for a mountain')) produced.add('R');
  if (oracleText.includes('search your library for a forest')) produced.add('G');

  // Specific symbols
  if (oracleText.includes('{w}')) produced.add('W');
  if (oracleText.includes('{u}')) produced.add('U');
  if (oracleText.includes('{b}')) produced.add('B');
  if (oracleText.includes('{r}')) produced.add('R');
  if (oracleText.includes('{g}')) produced.add('G');
  if (oracleText.includes('{c}')) produced.add('C');

  return Array.from(produced);
}

import { apiFetch } from '../config/apiConfig';
import { GamechangerService } from '../services/gamechangerService';
import { 
  getApiBaseUrl, 
  getRemoteDeckHistory, 
  getRemoteDeckHistorySnapshot, 
  compareDeckIterationsWithApi,
  formatDeckSummaryTextBlock,
  compareDeckFilesApi,
  formatCardsForApiComparison,
  formatCardsForDeckListApi,
  getCardApiName,
  compareDecks,
  CompareDecks
} from '../services/deckService';
import { Deck, DeckCard, DeckStats, MTGFormat, DeckHistoryItem, DeckDiff, DeckDiffItem, CollectionCard } from '../types/mtg';
import { getAllCardMatchNames } from './cardNameUtils';

/**
 * Standard basic land card names for fallback matching (11 canonical MTG basic lands and variants):
 * Plains, Island, Swamp, Mountain, Forest, their Snow-Covered variants, and Wastes.
 */
export const BASIC_LAND_NAMES = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
  'snow-covered wastes',
  'snow covered plains',
  'snow covered island',
  'snow covered swamp',
  'snow covered mountain',
  'snow covered forest',
  'snow covered wastes',
  'snowcovered plains',
  'snowcovered island',
  'snowcovered swamp',
  'snowcovered mountain',
  'snowcovered forest',
  'snowcovered wastes',
]);

/**
 * Normalizes a card name and checks if it matches one of the 11 MTG basic lands:
 * Plains, Island, Swamp, Mountain, Forest, the Snow-Covered variants of those 5, and Wastes.
 */
export function isBasicLandName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;

  // 1. Separate front face if double-faced (split by '//')
  let clean = name.split('//')[0];

  // 2. Remove parenthetical or bracketed info (e.g. (MH1), (NEO), [2X2], etc.)
  clean = clean.replace(/\s*[\(\[].*?[\)\]]/g, ' ');

  // 3. Remove trailing foil tags, collector numbers, set codes, hashtags (e.g. #251, 251, *F*)
  clean = clean.replace(/\*f\*/gi, ' ');
  clean = clean.replace(/#\s*\d+.*$/i, ' ');
  clean = clean.replace(/\b\d+[a-z]?\b.*$/i, ' ');

  // 4. Standardize dashes (en-dash, em-dash, hyphens) and collapse whitespace
  clean = clean.replace(/[\u2013\u2014]/g, '-').trim().toLowerCase();

  if (BASIC_LAND_NAMES.has(clean)) {
    return true;
  }

  // Regex fallback matching all 11 basic lands:
  // Swamp, Island, Forest, Mountain, Plains, the Snow-Covered Variants of those 5, and Wastes
  return /^(snow[- ]?covered\s+)?(plains|island|swamp|mountain|forest|wastes)$/i.test(clean);
}

/**
 * Checks if a card has the "Basic" supertype (e.g. Basic Land, Basic Snow Land, etc.).
 * Anything with the Basic Supertype can have any number of cards in the deck.
 * Guaranteed to match the 11 canonical MTG basic lands:
 * Plains, Island, Swamp, Mountain, Forest, their Snow-Covered variants, and Wastes.
 */
export function hasBasicSupertype(card: {
  name?: string;
  type_line?: string;
  typeLine?: string;
  supertypes?: string[];
  card_faces?: any[];
  [key: string]: any;
} | null | undefined): boolean {
  if (!card) return false;

  // 1. Direct name check (handles cards lacking type_line such as plain text imports)
  if (card.name && isBasicLandName(card.name)) {
    return true;
  }

  // 2. Check supertypes array if present
  const supertypes = (card as any).supertypes || (card as any).superTypes;
  if (Array.isArray(supertypes)) {
    if (supertypes.some((s: string) => typeof s === 'string' && s.trim().toLowerCase() === 'basic')) {
      return true;
    }
  }

  // 3. Check type_line / typeLine / type / TypeLine
  const typeLine = (
    card.type_line ||
    (card as any).typeLine ||
    (card as any).TypeLine ||
    (card as any).type ||
    ''
  ).trim();

  if (typeLine) {
    // Check for the "Basic" supertype word anywhere in type line or before the subtype dash
    const mainTypePart = typeLine.split('—')[0].split('-')[0].split('//')[0];
    if (/\bBasic\b/i.test(mainTypePart) || /\bBasic\b/i.test(typeLine)) {
      return true;
    }
  }

  // 4. Check card faces for double-faced / split cards
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    for (const face of card.card_faces) {
      if (face?.name && isBasicLandName(face.name)) {
        return true;
      }
      const faceType = (face?.type_line || face?.typeLine || face?.TypeLine || face?.type || '').trim();
      if (faceType && /\bBasic\b/i.test(faceType)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks whether a card can have any number of copies in a deck
 * (either has the Basic supertype or has the explicit "A deck can have any number of cards named ~" rule).
 */
export function canHaveAnyNumberOfCopies(card: any): boolean {
  if (!card) return false;
  if (hasBasicSupertype(card)) return true;

  const oracleText = card.oracle_text || card.card_faces?.[0]?.oracle_text || (card as any).oracleText || '';
  if (/A deck can have any number of/i.test(oracleText)) {
    return true;
  }
  return false;
}

export interface DeckUsageEntry {
  deckId: string;
  deckName: string;
  quantity: number;
}

export interface CrossDeckUsage {
  cardName: string;
  totalUsed: number;
  decks: DeckUsageEntry[];
}

/**
 * Calculates cross-deck card usage across all decks to identify which cards
 * are slotted into which decks and in what quantities.
 */
export function buildCrossDeckUsageMap(decks: Deck[]): Map<string, CrossDeckUsage> {
  const map = new Map<string, CrossDeckUsage>();
  (decks || []).forEach((d) => {
    (d.cards || []).forEach((c) => {
      const cat = (c.category || 'main').toLowerCase();
      // Maybeboard is not part of the active deck and does not claim collection copies
      if (cat === 'maybeboard') return;
      // Basic lands have unlimited availability and should not trigger in-use warnings
      if (canHaveAnyNumberOfCopies(c)) return;

      const cleanName = (typeof c?.name === 'string' ? c.name : '')
        .split(' // ')[0]
        .replace(/\s*[\(\[].*?[\)\]]/g, '')
        .trim()
        .toLowerCase();
      if (!cleanName) return;

      const qty = c.quantity || 1;
      const existing = map.get(cleanName);
      if (existing) {
        existing.totalUsed += qty;
        const deckEntry = existing.decks.find((de) => de.deckId === d.id);
        if (deckEntry) {
          deckEntry.quantity += qty;
        } else {
          existing.decks.push({ deckId: d.id, deckName: d.name || 'Untitled Deck', quantity: qty });
        }
      } else {
        map.set(cleanName, {
          cardName: c.name,
          totalUsed: qty,
          decks: [{ deckId: d.id, deckName: d.name || 'Untitled Deck', quantity: qty }],
        });
      }
    });
  });
  return map;
}

export interface CollectionLookup {
  idMap: Map<string, number>;
  nameMap: Map<string, number>;
  getQuantity: (card: { name?: string; scryfallId?: string } | string | null | undefined) => number;
}

/**
 * Builds a comprehensive normalized lookup structure for collection cards.
 * Indexes by scryfallId, exact name, normalized quotes, front face of split/DFC cards,
 * and cleaned name (stripped set codes and collector numbers).
 * Optionally filters to a specific target binder if targetBinderId is provided and not 'all'.
 */
export function buildCollectionLookup(
  collectionCards: CollectionCard[],
  targetBinderId?: string
): CollectionLookup {
  const filteredCards = (!targetBinderId || targetBinderId === 'all')
    ? (collectionCards || [])
    : (collectionCards || []).filter((c) => (c.binderId || 'binder-main') === targetBinderId);

  const idMap = new Map<string, number>();
  const nameMap = new Map<string, number>();

  filteredCards.forEach((c) => {
    if (!c) return;
    const qty = c.quantity || 1;
    if (c.scryfallId) {
      idMap.set(c.scryfallId, (idMap.get(c.scryfallId) || 0) + qty);
    }
    const rawName = (c.name || '').toLowerCase().trim();
    if (!rawName) return;

    const keys = new Set<string>();
    keys.add(rawName);
    getAllCardMatchNames(c).forEach((m) => keys.add(m));

    // Front face of double-faced cards or split cards
    const cleanFront = rawName.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    if (cleanFront) keys.add(cleanFront);

    // Normalized quotes / apostrophes
    const normalizedQuotes = rawName.replace(/['’`"]/g, "'");
    if (normalizedQuotes) keys.add(normalizedQuotes);

    // Front face without quotes
    const cleanFrontNoQuotes = cleanFront ? cleanFront.replace(/['’`"]/g, "'") : '';
    if (cleanFrontNoQuotes) keys.add(cleanFrontNoQuotes);

    // Front face without numbers/collector codes (e.g. "Urza 75" or "Urza #75")
    const cleanNoNum = cleanFrontNoQuotes ? cleanFrontNoQuotes.replace(/#?\s*\b\d+[a-z]?\b.*$/i, '').trim() : '';
    if (cleanNoNum) keys.add(cleanNoNum);

    keys.forEach((key) => {
      nameMap.set(key, (nameMap.get(key) || 0) + qty);
    });
  });

  const getQuantity = (card: { name?: string; scryfallId?: string } | string | null | undefined): number => {
    if (!card) return 0;
    if (typeof card === 'object') {
      if (card.scryfallId && idMap.has(card.scryfallId)) {
        return idMap.get(card.scryfallId)!;
      }
    }
    const cardName = typeof card === 'string' ? card : (card.name || '');
    if (!cardName) return 0;

    const tokens = getAllCardMatchNames(card);
    for (const token of tokens) {
      if (nameMap.has(token)) return nameMap.get(token)!;
    }

    const lower = cardName.toLowerCase().trim();
    if (nameMap.has(lower)) return nameMap.get(lower)!;

    const normQuotes = lower.replace(/['’`"]/g, "'");
    if (nameMap.has(normQuotes)) return nameMap.get(normQuotes)!;

    const cleanFront = lower.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    if (nameMap.has(cleanFront)) return nameMap.get(cleanFront)!;

    const cleanFrontNoQuotes = cleanFront.replace(/['’`"]/g, "'");
    if (nameMap.has(cleanFrontNoQuotes)) return nameMap.get(cleanFrontNoQuotes)!;

    const cleanNoNum = cleanFrontNoQuotes.replace(/#?\s*\b\d+[a-z]?\b.*$/i, '').trim();
    if (nameMap.has(cleanNoNum)) return nameMap.get(cleanNoNum)!;

    return 0;
  };

  return { idMap, nameMap, getQuantity };
}

export interface DeckCompletionResult {
  owned: number;
  total: number;
  pct: number;
  unownedCardsCount: number;
  missingList: Array<{ card: DeckCard; missingQty: number }>;
  missingPrice: number;
}

/**
 * Calculates deck collection completion percentage.
 * Handles:
 * - Commander inclusion across card categories (even if placed in sideboard or missing from cards array)
 * - Non-commander singleton and playset cards
 * - When there are NO unowned cards in the deck, guarantees 100% owned.
 */
export function calculateDeckCompletion(
  deck: Deck,
  collectionLookup: CollectionLookup | ((card: any) => number)
): DeckCompletionResult {
  const getOwnedQty = typeof collectionLookup === 'function'
    ? collectionLookup
    : collectionLookup.getQuantity;

  let owned = 0;
  let total = 0;
  let unownedCardsCount = 0;
  let missingPrice = 0;
  const missingList: Array<{ card: DeckCard; missingQty: number }> = [];

  const cards = deck.cards || [];
  const commanderName = (deck.commanderName || '').trim().toLowerCase();
  const commanderId = deck.commanderId || '';
  const commanderParts = commanderName ? commanderName.split(/\s*\/\/\s*/).map((p) => p.trim()) : [];

  // Track if any commander cards are present in the cards array
  let foundCommanderCard = false;
  let mainAndCmdrTotal = 0;

  cards.forEach((c) => {
    const cat = (c.category || 'main').toLowerCase();
    const cName = (c.name || '').trim().toLowerCase();
    const cleanCName = cName.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/#?\s*\b\d+[a-z]?\b.*$/i, '').replace(/['’`"]/g, "'").trim();
    const cleanCmdrName = commanderName.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/#?\s*\b\d+[a-z]?\b.*$/i, '').replace(/['’`"]/g, "'").trim();

    // Check if this card matches any part of partner commanders
    const matchesPartnerPart = commanderParts.some((p) => {
      const cleanP = p.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/#?\s*\b\d+[a-z]?\b.*$/i, '').replace(/['’`"]/g, "'").trim();
      return cName === p || cleanCName === cleanP;
    });

    // Check if this card is explicitly the commander or designated commander
    const isCmdr =
      cat === 'commander' ||
      Boolean(commanderId && c.scryfallId === commanderId) ||
      Boolean(commanderName && (cName === commanderName || (cleanCmdrName && cleanCName === cleanCmdrName))) ||
      matchesPartnerPart;

    if (isCmdr) {
      foundCommanderCard = true;
    }

    // Include mainboard and commander cards (ignore sideboard & maybeboard UNLESS it is the designated commander)
    if (cat === 'sideboard' || cat === 'maybeboard') {
      if (!isCmdr) return;
    }

    const qty = c.quantity || 1;
    total += qty;
    mainAndCmdrTotal += qty;
    const inCol = getOwnedQty(c);
    const ownedCopies = Math.min(qty, inCol);
    owned += ownedCopies;
    if (ownedCopies < qty) {
      const missingQty = qty - ownedCopies;
      unownedCardsCount += missingQty;
      const unitPrice = (c.isFoil && c.priceUsdFoil) ? c.priceUsdFoil : (c.priceUsd || 0);
      missingPrice += unitPrice * missingQty;
      missingList.push({ card: c, missingQty });
    }
  });

  // If this is a commander deck (or has a commander specified) but no commander card was designated in cards
  // IMPORTANT: Only add a synthetic commander if the deck does NOT already have 100 or more cards!
  if (!foundCommanderCard && (deck.format === 'commander' || commanderName || commanderId)) {
    if ((commanderName || commanderId) && mainAndCmdrTotal < 100) {
      total += 1;
      const cmdrInCol = getOwnedQty({ name: deck.commanderName, scryfallId: deck.commanderId });
      const cmdrOwned = Math.min(1, cmdrInCol);
      owned += cmdrOwned;
      if (cmdrOwned < 1) {
        unownedCardsCount += 1;
        const syntheticCmdrCard: DeckCard = {
          id: `cmdr-${deck.id}`,
          scryfallId: deck.commanderId || '',
          name: deck.commanderName || 'Commander',
          set: 'CMDR',
          cmc: 0,
          type_line: 'Legendary Creature',
          quantity: 1,
          category: 'commander',
          imageUrl: deck.commanderArtUrl,
        };
        missingList.push({ card: syntheticCmdrCard, missingQty: 1 });
      }
    }
  }

  // Exact percentage calculation:
  // When there are no unowned cards in the deck, it MUST say 100% owned!
  let pct = 0;
  if (total > 0) {
    if (unownedCardsCount === 0 || owned >= total) {
      pct = 100;
      unownedCardsCount = 0;
    } else {
      // If there are unowned cards, never round up to 100% (e.g. 99 out of 100 is 99%, not 100%)
      pct = Math.min(99, Math.floor((owned / total) * 100));
    }
  }

  return { owned, total, pct, unownedCardsCount, missingList, missingPrice };
}

export function calculateDeckStats(deck: Deck, scope: 'main' | 'all' = 'main'): DeckStats {
  const cards = deck.cards || [];

  let totalCards = 0;
  let mainboardCount = 0;
  let commanderCount = 0;
  let sideboardCount = 0;
  let maybeboardCount = 0;
  let totalPriceUsd = 0;
  let cmcSum = 0;
  let nonLandCmcCount = 0;

  const curveMap: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const colorPips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const typeBreakdown: Record<string, number> = {
    Creature: 0,
    Instant: 0,
    Sorcery: 0,
    Artifact: 0,
    Enchantment: 0,
    Planeswalker: 0,
    Land: 0,
    Other: 0,
  };

  cards.forEach((card) => {
    const qty = card.quantity || 1;
    totalCards += qty;

    if (card.category === 'main') {
      mainboardCount += qty;
    } else if (card.category === 'commander') {
      commanderCount += qty;
    } else if (card.category === 'sideboard') {
      sideboardCount += qty;
    } else if (card.category === 'maybeboard') {
      maybeboardCount += qty;
    }

    const shouldIncludeInAnalysis = scope === 'all' || (card.category === 'main' || card.category === 'commander');

    if (shouldIncludeInAnalysis) {
      const isLand = (card.type_line || (card as any).typeLine || '').toLowerCase().includes('land');
      if (!isLand) {
        const roundedCmc = Math.min(7, Math.max(0, Math.floor(card.cmc || 0)));
        curveMap[roundedCmc] = (curveMap[roundedCmc] || 0) + qty;
        cmcSum += (card.cmc || 0) * qty;
        nonLandCmcCount += qty;
      }

      // Parse color pips in mana_cost, e.g. {2}{U}{U}{B}
      if (card.mana_cost) {
        const symbols = card.mana_cost.match(/\{[A-Z0-9/]+\}/g) || [];
        symbols.forEach((sym) => {
          if (sym.includes('W')) colorPips.W += qty;
          if (sym.includes('U')) colorPips.U += qty;
          if (sym.includes('B')) colorPips.B += qty;
          if (sym.includes('R')) colorPips.R += qty;
          if (sym.includes('G')) colorPips.G += qty;
          if (sym.includes('C')) colorPips.C += qty;
        });
      }

      // Parse broad card types
      const t = card.type_line || (card as any).typeLine || '';
      if (t.includes('Creature')) typeBreakdown.Creature += qty;
      else if (t.includes('Instant')) typeBreakdown.Instant += qty;
      else if (t.includes('Sorcery')) typeBreakdown.Sorcery += qty;
      else if (t.includes('Planeswalker')) typeBreakdown.Planeswalker += qty;
      else if (t.includes('Artifact')) typeBreakdown.Artifact += qty;
      else if (t.includes('Enchantment')) typeBreakdown.Enchantment += qty;
      else if (t.includes('Land')) typeBreakdown.Land += qty;
      else typeBreakdown.Other += qty;
    }

    // Pricing calculation
    const unitPrice = card.isFoil && card.priceUsdFoil ? card.priceUsdFoil : card.priceUsd || 0;
    totalPriceUsd += unitPrice * qty;
  });

  const manaCurve = [0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => ({
    cmc: cmc === 7 ? '7+' : cmc.toString(),
    count: curveMap[cmc] || 0,
  }));

  const averageCmc = nonLandCmcCount > 0 ? parseFloat((cmcSum / nonLandCmcCount).toFixed(2)) : 0;

  // Format legality check
  const illegalCards: string[] = [];
  const cardNameCounts: Record<string, number> = {};

  // Extract Commander identity if Commander format
  const commanderInfo = deck.format === 'commander' ? getDeckCommander(deck) : null;

  cards.forEach((c) => {
    if (c.category === 'main' || c.category === 'commander') {
      const isUnlimited = canHaveAnyNumberOfCopies(c);
      const cleanName = c.name.split(' // ')[0].trim();
      cardNameCounts[cleanName] = (cardNameCounts[cleanName] || 0) + c.quantity;

      if (!isUnlimited) {
        if (deck.format === 'commander' && cardNameCounts[cleanName] > 1) {
          illegalCards.push(`${cleanName} exceeds Commander singleton limit (1 copy allowed)`);
        } else if (deck.format !== 'commander' && cardNameCounts[cleanName] > 4) {
          illegalCards.push(`${cleanName} exceeds format playset limit (maximum 4 copies)`);
        }
      }

      // Check commander color identity legality for each non-commander card
      if (deck.format === 'commander' && commanderInfo?.hasCommander && c.category !== 'commander') {
        const cardIdentity = (c.color_identity && c.color_identity.length > 0)
          ? c.color_identity
          : (c.colors || []);
        
        const illegalColors = cardIdentity.filter(
          (col) => !commanderInfo.colorIdentity.includes(col.toUpperCase())
        );

        if (illegalColors.length > 0) {
          illegalCards.push(
            `"${c.name}" color identity {${illegalColors.join('}{')}} does not fit commander ${commanderInfo.commanderName || 'commander'} ({${commanderInfo.colorIdentity.join('') || 'C'}})`
          );
        }
      }
    }
  });

  if (deck.format === 'commander') {
    const commanderCards = cards.filter((c) => c.category === 'commander');
    const commanderQty = commanderCards.reduce((s, c) => s + (c.quantity || 1), 0);
    const nonCommanderMainQty = cards
      .filter((c) => c.category === 'main')
      .reduce((s, c) => s + (c.quantity || 1), 0);

    if (commanderCards.length === 0) {
      illegalCards.push('Missing designated Commander');
    } else if (commanderCards.length > 2 || commanderQty > 2) {
      illegalCards.push(`Commander decks cannot have more than 2 commanders (Current: ${commanderQty})`);
    }

    const totalCommanderDeckSize = mainboardCount + commanderQty;
    if (totalCommanderDeckSize !== 100) {
      if (commanderCards.length === 2 || commanderQty === 2) {
        illegalCards.push(`Commander decks with 2 commanders require exactly 100 cards (2 commanders + 98 other cards; Current: ${totalCommanderDeckSize})`);
      } else if (commanderCards.length === 1 && commanderQty === 1) {
        illegalCards.push(`Commander decks must have exactly 100 cards total (1 commander + 99 other cards; Current: ${totalCommanderDeckSize})`);
      } else {
        illegalCards.push(`Commander decks must have exactly 100 cards total (Current: ${totalCommanderDeckSize})`);
      }
    }
  } else if (deck.format !== 'casual' && mainboardCount < 60) {
    illegalCards.push(`Constructed decks require at least 60 mainboard cards (Current: ${mainboardCount})`);
  }

  return {
    totalCards,
    mainboardCount,
    commanderCount,
    sideboardCount,
    maybeboardCount,
    averageCmc,
    totalPriceUsd: parseFloat(((Number(totalPriceUsd) || 0)).toFixed(2)),
    manaCurve,
    colorPips,
    typeBreakdown,
    illegalCards,
  };
}

/**
 * Exports deck to Arena/Text list format
 */
export function exportDeckToText(deck: Deck): string {
  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
  const mainCards = deck.cards.filter((c) => c.category === 'main');
  const sideCards = deck.cards.filter((c) => c.category === 'sideboard');
  const maybeCards = deck.cards.filter((c) => c.category === 'maybeboard');

  const lines: string[] = [];

  if (commanderCards.length > 0) {
    lines.push('// Commander');
    commanderCards.forEach((c) => {
      lines.push(`${c.quantity} ${c.name}`);
    });
    lines.push('');
  }

  lines.push('// Deck');
  mainCards.forEach((c) => {
    lines.push(`${c.quantity} ${c.name}`);
  });

  if (sideCards.length > 0) {
    lines.push('');
    lines.push('// Sideboard');
    sideCards.forEach((c) => {
      lines.push(`${c.quantity} ${c.name}`);
    });
  }

  if (maybeCards.length > 0) {
    lines.push('');
    lines.push('// Maybeboard');
    maybeCards.forEach((c) => {
      lines.push(`${c.quantity} ${c.name}`);
    });
  }

  return lines.join('\n');
}

/**
 * Parses a simple text decklist line by line
 */
export function parseTextDecklist(text: string): { quantity: number; name: string; category: 'main' | 'sideboard' | 'commander' }[] {
  const lines = text.split('\n');
  let currentCategory: 'main' | 'sideboard' | 'commander' = 'main';
  const results: { quantity: number; name: string; category: 'main' | 'sideboard' | 'commander' }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check category headers
    if (/^(\/\/|#)?\s*commander/i.test(line)) {
      currentCategory = 'commander';
      continue;
    }
    if (/^(\/\/|#)?\s*(main|deck)/i.test(line)) {
      currentCategory = 'main';
      continue;
    }
    if (/^(\/\/|#)?\s*sideboard/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }
    if (/^(\/\/|#)/.test(line)) {
      continue;
    }

    // Match lines like "4 Lightning Bolt" or "1x Atraxa, Praetors' Voice" or "4 Lightning Bolt (2X2) 117"
    const match = line.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cardName = line;

    if (match) {
      qty = parseInt(match[1], 10);
      cardName = match[2];
    }

    // Strip set codes like (MH2) 138 or *F*
    cardName = cardName.replace(/\s*\([A-Za-z0-9_]+\)\s*[0-9A-Za-z]*.*$/, '');
    cardName = cardName.replace(/\*F\*/i, '').trim();

    if (cardName) {
      results.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: currentCategory,
      });
    }
  }

  return results;
}

export const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

export function sortWUBRG(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const idxA = WUBRG_ORDER.indexOf(a.toUpperCase());
    const idxB = WUBRG_ORDER.indexOf(b.toUpperCase());
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
}

/**
 * Extracts the effective gameplay color(s) of a card.
 * Correctly accounts for double-sided cards (Transform, MDFC, Flip, Split, Adventures)
 * whose front face has colors even if top-level Scryfall colors array is empty or undefined.
 */
export function getCardEffectiveColors(card: {
  name?: string;
  colors?: string[];
  card_faces?: Array<{ colors?: string[]; mana_cost?: string; type_line?: string; color_indicator?: string[] }>;
  mana_cost?: string;
  type_line?: string;
  color_identity?: string[];
  oracle_text?: string;
}): string[] {
  if (!card) return [];

  // 1. Explicit top-level colors array if non-empty
  if (Array.isArray(card.colors) && card.colors.length > 0) {
    return sortWUBRG(card.colors);
  }

  // 2. Front face of double-faced cards (MDFCs, Transform, etc.)
  if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const front = card.card_faces[0];
    if (Array.isArray(front.colors) && front.colors.length > 0) {
      return sortWUBRG(front.colors);
    }
    if (Array.isArray(front.color_indicator) && front.color_indicator.length > 0) {
      return sortWUBRG(front.color_indicator);
    }
    if (front.mana_cost) {
      const pips = front.mana_cost.match(/[WUBRG]/gi);
      if (pips && pips.length > 0) {
        return sortWUBRG(Array.from(new Set(pips.map((p) => p.toUpperCase()))));
      }
    }
  }

  // 3. Parse mana_cost on top level if present
  if (card.mana_cost) {
    const pips = card.mana_cost.match(/[WUBRG]/gi);
    if (pips && pips.length > 0) {
      return sortWUBRG(Array.from(new Set(pips.map((p) => p.toUpperCase()))));
    }
  }

  // 4. If card has color_identity and is NOT a land (or has double-face // in name)
  const typeLine = (card.type_line || (card as any).typeLine || '').toLowerCase();
  const isLand = typeLine.includes('land');
  if (!isLand && Array.isArray(card.color_identity) && card.color_identity.length > 0) {
    return sortWUBRG(card.color_identity);
  }

  return [];
}

/**
 * Categorizes a card into standard MTG color grouping for piles and sorts:
 * 'W' | 'U' | 'B' | 'R' | 'G' | 'multi' | 'colorless' | 'land'
 */
export function getCardColorGroup(card: {
  name?: string;
  colors?: string[];
  card_faces?: Array<{ colors?: string[]; mana_cost?: string; type_line?: string }>;
  mana_cost?: string;
  type_line?: string;
  color_identity?: string[];
}): 'W' | 'U' | 'B' | 'R' | 'G' | 'multi' | 'colorless' | 'land' {
  const typeLine = (card.type_line || (card as any).typeLine || '').toLowerCase();
  if (typeLine.includes('land')) {
    return 'land';
  }

  const colors = getCardEffectiveColors(card);
  if (colors.length === 0) {
    return 'colorless';
  }
  if (colors.length === 1) {
    const col = colors[0].toUpperCase();
    if (['W', 'U', 'B', 'R', 'G'].includes(col)) {
      return col as 'W' | 'U' | 'B' | 'R' | 'G';
    }
    return 'colorless';
  }
  return 'multi';
}

/**
 * Returns a numerical sort rank for color sorting in standard MTG order:
 * W (1) -> U (2) -> B (3) -> R (4) -> G (5) -> Multi (6) -> Colorless (7) -> Land (8)
 */
export function getCardColorCategoryRank(card: {
  name?: string;
  colors?: string[];
  card_faces?: Array<{ colors?: string[]; mana_cost?: string; type_line?: string }>;
  mana_cost?: string;
  type_line?: string;
  color_identity?: string[];
}): number {
  const group = getCardColorGroup(card);
  switch (group) {
    case 'W': return 1;
    case 'U': return 2;
    case 'B': return 3;
    case 'R': return 4;
    case 'G': return 5;
    case 'multi': return 6;
    case 'colorless': return 7;
    case 'land': return 8;
    default: return 9;
  }
}

export function getDeckCommander(deck?: Deck | null): {
  commanderCard: DeckCard | null;
  commanderCards: DeckCard[];
  commanderName: string | null;
  commanderArtUrl: string | null;
  colorIdentity: string[];
  hasCommander: boolean;
} {
  if (!deck) {
    return {
      commanderCard: null,
      commanderCards: [],
      commanderName: null,
      commanderArtUrl: null,
      colorIdentity: [],
      hasCommander: false,
    };
  }

  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
  const hasCommander = commanderCards.length > 0;

  let rawIdentity: string[] = [];
  if (hasCommander) {
    rawIdentity = Array.from(
      new Set(
        commanderCards.flatMap((c) => {
          if (c.color_identity && c.color_identity.length > 0) {
            return c.color_identity;
          }
          if (c.colors && c.colors.length > 0) {
            return c.colors;
          }
          if (c.mana_cost) {
            const matches = c.mana_cost.match(/[WUBRG]/gi) || [];
            return matches.map((m) => m.toUpperCase());
          }
          return [];
        })
      )
    );
  } else if (deck.commanderColorIdentity && deck.commanderColorIdentity.length > 0) {
    rawIdentity = deck.commanderColorIdentity;
  }

  const colorIdentity = sortWUBRG(rawIdentity);
  const commanderName = deck.commanderName || (
    commanderCards.length > 1
      ? commanderCards.map((c) => c.name).join(' // ')
      : commanderCards[0]?.name || null
  );
  const commanderArtUrl = deck.commanderArtUrl || commanderCards[0]?.imageUrl || null;

  return {
    commanderCard: commanderCards[0] || null,
    commanderCards,
    commanderName,
    commanderArtUrl,
    colorIdentity,
    hasCommander,
  };
}

export function isCardLegalInCommander(
  card: {
    name?: string;
    color_identity?: string[];
    colors?: string[];
    type_line?: string;
    mana_cost?: string;
    legalities?: Record<string, string>;
  },
  commanderColorIdentity: string[],
  options?: { allowBanned?: boolean }
): { isLegal: boolean; reason?: string; isBanned?: boolean } {
  const isBanned = Boolean(
    card.legalities &&
    (card.legalities['commander'] === 'banned' || card.legalities['Commander'] === 'banned')
  );

  if (isBanned && !options?.allowBanned) {
    return { isLegal: false, reason: 'Card is banned in Commander format', isBanned: true };
  }

  let cardIdentity = (card.color_identity && card.color_identity.length > 0)
    ? card.color_identity
    : (card.colors || []);

  if (cardIdentity.length === 0) {
    if (card.mana_cost) {
      const pips = card.mana_cost.match(/[WUBRG]/gi);
      if (pips && pips.length > 0) {
        cardIdentity = Array.from(new Set(pips.map((p) => p.toUpperCase())));
      }
    }
    if (cardIdentity.length === 0 && (card as any).card_faces && Array.isArray((card as any).card_faces)) {
      const facePips = ((card as any).card_faces as any[]).flatMap((f) => {
        const costPips = (f.mana_cost || '').match(/[WUBRG]/gi) || [];
        return [...(f.colors || []), ...(f.color_identity || []), ...costPips];
      });
      if (facePips.length > 0) {
        cardIdentity = Array.from(new Set(facePips.map((p) => p.toUpperCase())));
      }
    }
    if (cardIdentity.length === 0 && card.name) {
      const basicMap: Record<string, string> = {
        plains: 'W',
        island: 'U',
        swamp: 'B',
        mountain: 'R',
        forest: 'G',
        'snow-covered plains': 'W',
        'snow-covered island': 'U',
        'snow-covered swamp': 'B',
        'snow-covered mountain': 'R',
        'snow-covered forest': 'G',
        'snow covered plains': 'W',
        'snow covered island': 'U',
        'snow covered swamp': 'B',
        'snow covered mountain': 'R',
        'snow covered forest': 'G',
        'snowcovered plains': 'W',
        'snowcovered island': 'U',
        'snowcovered swamp': 'B',
        'snowcovered mountain': 'R',
        'snowcovered forest': 'G',
      };
      const cleanName = card.name.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim().toLowerCase();
      if (basicMap[cleanName]) {
        cardIdentity = [basicMap[cleanName]];
      }
    }
  }

  const upperCommanderIdentity = commanderColorIdentity.map((c) => c.toUpperCase());
  const illegalColors = cardIdentity.filter((c) => !upperCommanderIdentity.includes(c.toUpperCase()));

  if (illegalColors.length > 0) {
    const formattedIllegal = illegalColors.map((c) => `{${c}}`).join('');
    const formattedCommander = upperCommanderIdentity.length > 0
      ? upperCommanderIdentity.map((c) => `{${c}}`).join('')
      : '{C} (Colorless)';
    return {
      isLegal: false,
      reason: `Card has ${formattedIllegal} identity, exceeding commander's identity (${formattedCommander})`,
    };
  }

  return { isLegal: true };
}

export interface CommanderPartnerInfo {
  canHavePartner: boolean;
  partnerType: 'none' | 'partner' | 'partner_variant' | 'partner_with' | 'choose_background' | 'background' | 'friends_forever' | 'doctors_companion' | 'doctor';
  partnerVariant?: string;
  partnerWithTarget?: string;
  description: string;
}

/**
 * Checks whether a card can serve as a primary Commander in Commander/EDH format.
 * Must be a Legendary Creature or a card with 'can be your commander'.
 */
export function canBePrimaryCommander(card: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  card_faces?: any[];
}): boolean {
  if (!card) return false;
  const typeLine = (card.type_line || (card as any).typeLine || (card as any).TypeLine || (card as any).type || '').toLowerCase();
  const oracle = (card.oracle_text || (card as any).oracleText || (card as any).OracleText || '').toLowerCase();

  if (oracle.includes('can be your commander')) {
    return true;
  }

  const isLegendary = typeLine.includes('legendary') ||
    (Array.isArray((card as any).supertypes) && (card as any).supertypes.some((s: string) => String(s).toLowerCase() === 'legendary'));
  const isCreature = typeLine.includes('creature') || typeLine.includes('summon');

  if (isLegendary && (isCreature || typeLine.includes('planeswalker') || typeLine.includes('vehicle'))) {
    if (isCreature) return true;
    if (oracle.includes('can be your commander')) return true;
  }

  if (card.card_faces && Array.isArray(card.card_faces) && card.card_faces.length > 0) {
    const front = card.card_faces[0];
    const frontType = (front.type_line || front.typeLine || front.TypeLine || front.type || '').toLowerCase();
    const frontOracle = (front.oracle_text || front.oracleText || front.OracleText || '').toLowerCase();
    if (frontOracle.includes('can be your commander')) return true;
    if (frontType.includes('legendary') && (frontType.includes('creature') || frontType.includes('summon'))) return true;
  }

  // Fallback: If typeLine was truncated or missing from upstream cache but name matches famous legend pattern
  if (isCreature && card.name && card.name.includes(',')) {
    return true;
  }

  return false;
}

/**
 * Known "Partner with" pairs in MTG (Battlebond, Commander 2020, etc.)
 * Used as an authoritative lookup and fallback for partner-with detection.
 */
export const KNOWN_PARTNER_WITH_PAIRS: Record<string, string> = {
  'Regna, the Redeemer': 'Krav, the Unredeemed',
  'Krav, the Unredeemed': 'Regna, the Redeemer',
  'Virtus the Veiled': 'Gorm the Great',
  'Gorm the Great': 'Virtus the Veiled',
  'Pir, Imaginative Rascal': 'Toothy, Imaginary Friend',
  'Toothy, Imaginary Friend': 'Pir, Imaginative Rascal',
  'Khorvath Brightflame': 'Sylvia Brightspear',
  'Sylvia Brightspear': 'Khorvath Brightflame',
  'Okaun, Eye of Chaos': 'Zndrsplt, Eye of Wisdom',
  'Zndrsplt, Eye of Wisdom': 'Okaun, Eye of Chaos',
  'Rowan Kenrith': 'Will Kenrith',
  'Will Kenrith': 'Rowan Kenrith',
  'Brallin, Skyshark Rider': 'Shabraz, the Skyshark',
  'Shabraz, the Skyshark': 'Brallin, Skyshark Rider',
  'Cazur, Ruthless Stalker': 'Ukkima, Stalking Shadow',
  'Ukkima, Stalking Shadow': 'Cazur, Ruthless Stalker',
  'Haldan, Avid Arcanist': 'Pako, Arcane Retriever',
  'Pako, Arcane Retriever': 'Haldan, Avid Arcanist',
  'Nikara, Lair Scavenger': 'Yannik, Scavenging Sentinel',
  'Yannik, Scavenging Sentinel': 'Nikara, Lair Scavenger',
  'Blaring Captain': 'Blaring Recruiter',
  'Blaring Recruiter': 'Blaring Captain',
  'Chakram Retriever': 'Chakram Slinger',
  'Chakram Slinger': 'Chakram Retriever',
  'Impetuous Protege': 'Proud Mentor',
  'Proud Mentor': 'Impetuous Protege',
  'Ley Weaver': 'Lore Weaver',
  'Lore Weaver': 'Ley Weaver',
  'Soulblade Corrupter': 'Soulblade Renewer',
  'Soulblade Renewer': 'Soulblade Corrupter',
};

export const KNOWN_GENERIC_PARTNERS = new Set([
  'akiri, line-slinger', 'alharu, solemn ritualist', 'anara, wolvid familiar',
  'ardenn, intrepid archaeologist', 'armix, filigree thrasher', 'bruse tarl, boorish herder',
  'dargo, the shipwrecker', 'esior, wardwing familiar', 'falthis, shadowcat familiar',
  'ghost of ramirez depietro', 'glacian, powerstone engineer', 'halana, kessig ranger',
  'ich-tekik, salvage splicer', 'ikra shidiqi, the usurper', 'ishai, ojutai dragonspeaker',
  'jeska, thrice reborn', 'kamahl, heart of krosa', 'kediss, emberclaw familiar',
  'keleth, sunmane familiar', 'keskit, the flesh sculptor', 'kodama of the east tree',
  'krark, the thumbless', 'kraum, ludevic\'s opus', 'kydele, chosen of kruphix',
  'livio, oathsworn sentinel', 'ludevic, necro-alchemist', 'malcolm, keen-eyed navigator',
  'miara, thorn of the glade', 'nadier, agent of the duskenel', 'numa, joraga chieftain',
  'piper wright, publick reporter', 'prava of the steel legion', 'ravos, soultender',
  'rebbec, architect of ascension', 'reyhan, last of the abzan', 'rograkh, son of rohgahh',
  'sakashima of a thousand faces', 'sengir, the dark baron', 'siani, eye of the dusk',
  'sidar kondo of jamuraa', 'silas renn, seeker adept', 'slurrk, all-ingesting',
  'tana, the bloodsower', 'thrasios, triton hero', 'toggo, goblin weaponsmith',
  'tormod, the desecrator', 'tymna the weaver', 'vial smasher the fierce',
  'yoshimaru, ever faithful'
]);

export const KNOWN_CHOOSE_BACKGROUND_COMMANDERS = new Set([
  'abdel adrian, gorion\'s ward', 'alora, merry thief', 'amber gristle o\'maul',
  'baeloth barrityl, entertainer', 'burakos, party leader', 'ellyn harbreeze, busybody',
  'erinis, gloom stalker', 'ganax, astral hunter', 'gut, true soul zealot',
  'halsin, emerald archdruid', 'imoen, mystic trickster', 'jaheira, friend of the forest',
  'karlach, fury of avernus', 'lulu, loyal hollyphant', 'rasaad yn bashir',
  'renari, merchant of marvels', 'safana, calimport cutthroat', 'shadowheart, dark justiciar',
  'sivriss, nightmare speaker', 'skanos dragonheart', 'vhal, candlekeep researcher',
  'viconia, drow apostate', 'volo, itinerant scholar', 'wilson, refined grizzly',
  'wyll, blade of frontiers'
]);

export const KNOWN_BACKGROUND_ENCHANTMENTS = new Set([
  'agent of the iron throne', 'agent of the shadow thieves', 'clan crafter',
  'cloakwood hermit', 'criminal past', 'cultist of the absolute', 'dragon cultist',
  'dungeon delver', 'faceless one', 'far traveler', 'feywild visitor', 'flaming fist',
  'folk hero', 'guild artisan', 'hardy outlander', 'haunted one', 'inspiring leader',
  'master chef', 'military veteran', 'noble heritage', 'passionate archaeologist',
  'popular entertainer', 'raised by giants', 'scion of halaster', 'shameless charlatan',
  'street urchin', 'sword coast sailor', 'tavern brawler', 'veteran soldier'
]);

export const KNOWN_FRIENDS_FOREVER = new Set([
  'bjorna, nightfall alchemist', 'cecily, haunted mage', 'elmar, renegade mage',
  'hargilde, kindly runecrafter', 'othelm, sigardian outcast', 'sophina, spearsage deserter',
  'wernog, rider\'s chaplain', 'chief jim hopper', 'dustin, gadget genius',
  'eleven, the mage', 'lucas, the sharper', 'max, the daredevil', 'mike, the dungeon master',
  'will the wise'
]);

export const KNOWN_DOCTORS = new Set([
  'the first doctor', 'the second doctor', 'the third doctor', 'the fourth doctor',
  'the fifth doctor', 'the sixth doctor', 'the seventh doctor', 'the eighth doctor',
  'the ninth doctor', 'the tenth doctor', 'the eleventh doctor', 'the twelfth doctor',
  'the thirteenth doctor', 'the fourteenth doctor', 'the fifteenth doctor',
  'the war doctor', 'fugitive of the doctor'
]);

export const KNOWN_DOCTORS_COMPANIONS = new Set([
  'amy pond', 'clara oswald', 'donna noble', 'ian chesterton', 'jamie mccrimmon',
  'jo grant', 'k-9, mark i', 'leela, sevateem warrior', 'martha jones', 'nardole, resourceful cyborg',
  'peri brown', 'romana ii', 'rose tyler', 'ryan sinclair', 'sarah jane smith',
  'susan foreman', 'tegan jovanka', 'vislor turlough', 'yasmin khan'
]);

export const KNOWN_PARTNER_VARIANTS: Record<string, string> = {
  'chun-li, countless kicks': 'character select',
  'dhalsim, pliable pacifist': 'character select',
  'guile, sonic soldier': 'character select',
  'e. honda, sumo slammer': 'character select',
  'ken, burning brawler': 'character select',
  'ryu, world warrior': 'character select',
  'zangief, the red cyclone': 'character select',
  'blanka, ferocious friend': 'character select'
};


/**
 * Analyzes card metadata (keywords, type_line, oracle_text) to determine
 * whether a card supports Partner, Partner Variants, Background, Friends Forever, or Doctor mechanics.
 */
export function getCardPartnerInfo(card: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  all_parts?: { component?: string; name: string; type_line?: string }[];
}): CommanderPartnerInfo {
  const typeLine = (card.type_line || (card as any).typeLine || '').toLowerCase();
  const oracle = (card.oracle_text || (card as any).oracleText || '').toLowerCase();
  const keywords = (card.keywords || []).map((k) => k.toLowerCase());

  // Authoritative name check fallback (works even if oracle_text or keywords are missing from card object)
  const normName = (card.name || '').split(' // ')[0].replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
  if (normName) {
    if (KNOWN_BACKGROUND_ENCHANTMENTS.has(normName)) {
      return {
        canHavePartner: true,
        partnerType: 'background',
        description: 'Background (Pairs with a Commander having "Choose a Background")',
      };
    }
    if (KNOWN_CHOOSE_BACKGROUND_COMMANDERS.has(normName)) {
      return {
        canHavePartner: true,
        partnerType: 'choose_background',
        description: 'Choose a Background (Pairs with a Legendary Background enchantment)',
      };
    }
    if (KNOWN_GENERIC_PARTNERS.has(normName)) {
      return {
        canHavePartner: true,
        partnerType: 'partner',
        description: 'Partner (Pairs with any other Commander with generic Partner)',
      };
    }
    if (KNOWN_FRIENDS_FOREVER.has(normName)) {
      return {
        canHavePartner: true,
        partnerType: 'friends_forever',
        description: 'Friends Forever (Pairs with another Friends Forever commander)',
      };
    }
    if (KNOWN_DOCTORS.has(normName)) {
      return {
        canHavePartner: true,
        partnerType: 'doctor',
        description: "Time Lord Doctor (Pairs with a Doctor's Companion)",
      };
    }
    if (KNOWN_DOCTORS_COMPANIONS.has(normName)) {
      return {
        canHavePartner: true,
        partnerType: 'doctors_companion',
        description: "Doctor's Companion (Pairs with a Time Lord Doctor)",
      };
    }
    if (KNOWN_PARTNER_VARIANTS[normName]) {
      const v = KNOWN_PARTNER_VARIANTS[normName];
      return {
        canHavePartner: true,
        partnerType: 'partner_variant',
        partnerVariant: v,
        description: `Partner — ${v.charAt(0).toUpperCase() + v.slice(1)} (Pairs only with other "${v}" commanders)`,
      };
    }
  }

  // 1. Background enchantment (Pairs with a Commander having "Choose a Background")
  if (typeLine.includes('background') && typeLine.includes('enchantment')) {
    return {
      canHavePartner: true,
      partnerType: 'background',
      description: 'Background (Pairs with a Commander having "Choose a Background")',
    };
  }

  // 2. Choose a Background (Pairs with a Legendary Background enchantment)
  if (keywords.includes('choose a background') || oracle.includes('choose a background')) {
    return {
      canHavePartner: true,
      partnerType: 'choose_background',
      description: 'Choose a Background (Pairs with a Legendary Background enchantment)',
    };
  }

  // 3. Partner with [Specific Card Name]
  // Card names can contain commas (e.g. "Krav, the Unredeemed", "Brallin, Skyshark Rider").
  // Reminder text begins with '(', a newline, or trailing period.
  const partnerWithMatch = (card.oracle_text || (card as any).oracleText || '').match(/partner with\s+([^\r\n(]+?)(?:\s*\(|\.?\s*[\r\n]|\.?\s*$)/i);
  let target = partnerWithMatch ? partnerWithMatch[1].trim().replace(/\.+$/, '') : undefined;

  // Fallback 1: Scryfall all_parts combo_piece
  if (!target && card.all_parts && Array.isArray(card.all_parts)) {
    const cardNameLower = (card.name || '').toLowerCase();
    const partnerPart = card.all_parts.find(
      (p) => p.component === 'combo_piece' && p.name.toLowerCase() !== cardNameLower
    );
    if (partnerPart) {
      target = partnerPart.name;
    }
  }

  // Fallback 2: Authoritative fallback lookup
  if (!target && card.name) {
    const trimmed = card.name.trim();
    target = KNOWN_PARTNER_WITH_PAIRS[trimmed];
    if (!target) {
      const lower = trimmed.toLowerCase();
      const matchKey = Object.keys(KNOWN_PARTNER_WITH_PAIRS).find((k) => k.toLowerCase() === lower);
      if (matchKey) {
        target = KNOWN_PARTNER_WITH_PAIRS[matchKey];
      }
    }
  }

  if (keywords.includes('partner with') || target || (card.oracle_text || (card as any).oracleText || '').toLowerCase().includes('partner with')) {
    return {
      canHavePartner: true,
      partnerType: 'partner_with',
      partnerWithTarget: target,
      description: target ? ('Partner with ' + target) : 'Partner with specific card',
    };
  }

  // 4. Partner - [Specific Variant] (e.g. "Partner—Character select" / "Partner - Character select")
  // Handles em-dash, en-dash, and standard hyphen
  const partnerVariantMatch = (card.oracle_text || (card as any).oracleText || '').match(/partner\s*[—–-]\s*([^\r\n(]+?)(?:\s*\(|\.?\s*[\r\n]|\.?\s*$)/i);
  if (partnerVariantMatch) {
    const rawVariant = partnerVariantMatch[1].trim().replace(/\.+$/, '');
    const normVariant = rawVariant.toLowerCase();
    if (!normVariant.startsWith('with')) {
      return {
        canHavePartner: true,
        partnerType: 'partner_variant',
        partnerVariant: normVariant,
        description: `Partner — ${rawVariant} (Pairs only with other "${rawVariant}" commanders)`,
      };
    }
  }

  // 5. Doctor's companion
  if (keywords.includes("doctor's companion") || oracle.includes("doctor's companion")) {
    return {
      canHavePartner: true,
      partnerType: 'doctors_companion',
      description: "Doctor's Companion (Pairs with a Time Lord Doctor)",
    };
  }

  // 6. Time Lord Doctor
  if (typeLine.includes('time lord') && typeLine.includes('doctor')) {
    return {
      canHavePartner: true,
      partnerType: 'doctor',
      description: "Time Lord Doctor (Pairs with a Doctor's Companion)",
    };
  }

  // 7. Friends forever
  if (keywords.includes('friends forever') || oracle.includes('friends forever')) {
    return {
      canHavePartner: true,
      partnerType: 'friends_forever',
      description: 'Friends Forever (Pairs with another Friends Forever commander)',
    };
  }

  // 8. Generic Partner (MUST NOT have partner with, partner—, partner -, etc.)
  const hasGenericPartner = keywords.includes('partner') || /\bpartner\b/i.test(oracle);
  if (hasGenericPartner && !/partner\s*(?:with|[—–-])/i.test(oracle)) {
    return {
      canHavePartner: true,
      partnerType: 'partner',
      description: 'Partner (Pairs with any other Commander with generic Partner)',
    };
  }

  return {
    canHavePartner: false,
    partnerType: 'none',
    description: 'Does not support a Partner or Background',
  };
}

/**
 * Validates whether two candidate cards can legally partner together under MTG Commander rules.
 */
export function canCardsPartnerTogether(
  cmdr1: { name?: string; type_line?: string; oracle_text?: string; keywords?: string[] },
  cmdr2: { name?: string; type_line?: string; oracle_text?: string; keywords?: string[] }
): { canPartner: boolean; reason?: string } {
  const p1 = getCardPartnerInfo(cmdr1);
  const p2 = getCardPartnerInfo(cmdr2);

  if (!p1.canHavePartner) {
    return {
      canPartner: false,
      reason: '"' + (cmdr1.name || 'Current Commander') + '" does not have Partner, Choose a Background, or a partner ability.',
    };
  }

  if (!p2.canHavePartner) {
    return {
      canPartner: false,
      reason: '"' + (cmdr2.name || 'Candidate card') + '" does not have Partner, Background, or a partner ability.',
    };
  }

  // 1. Generic Partner + Generic Partner ONLY
  if (p1.partnerType === 'partner' && p2.partnerType === 'partner') {
    return { canPartner: true };
  }

  // 2. Partner Variant + Partner Variant (e.g. Partner - Character Select only pairs with Partner - Character Select)
  if (p1.partnerType === 'partner_variant' && p2.partnerType === 'partner_variant') {
    if (p1.partnerVariant && p2.partnerVariant && p1.partnerVariant === p2.partnerVariant) {
      return { canPartner: true };
    }
    return {
      canPartner: false,
      reason: `Incompatible partner variants: "${cmdr1.name}" (${p1.description}) cannot pair with "${cmdr2.name}" (${p2.description}).`,
    };
  }

  // 3. Choose a Background + Background Enchantment
  if (
    (p1.partnerType === 'choose_background' && p2.partnerType === 'background') ||
    (p1.partnerType === 'background' && p2.partnerType === 'choose_background')
  ) {
    return { canPartner: true };
  }

  // 4. Partner with [Specific Card]
  if (p1.partnerType === 'partner_with' || p2.partnerType === 'partner_with') {
    const target1 = p1.partnerWithTarget ? p1.partnerWithTarget.toLowerCase().trim() : '';
    const target2 = p2.partnerWithTarget ? p2.partnerWithTarget.toLowerCase().trim() : '';
    const name1 = (cmdr1.name || '').toLowerCase().trim();
    const name2 = (cmdr2.name || '').toLowerCase().trim();

    const matches1 = Boolean(target1 && (name2.includes(target1) || target1.includes(name2)));
    const matches2 = Boolean(target2 && (name1.includes(target2) || target2.includes(name1)));

    if (matches1 || matches2) {
      return { canPartner: true };
    }
    return {
      canPartner: false,
      reason: '"' + cmdr1.name + '" can only partner specifically with "' + (p1.partnerWithTarget || 'its designated partner') + '" (not "' + cmdr2.name + '").',
    };
  }

  // 5. Friends Forever + Friends Forever
  if (p1.partnerType === 'friends_forever' && p2.partnerType === 'friends_forever') {
    return { canPartner: true };
  }

  // 6. Doctor + Doctor's Companion
  if (
    (p1.partnerType === 'doctor' && p2.partnerType === 'doctors_companion') ||
    (p1.partnerType === 'doctors_companion' && p2.partnerType === 'doctor')
  ) {
    return { canPartner: true };
  }

  return {
    canPartner: false,
    reason: 'Incompatible partner mechanics: "' + cmdr1.name + '" (' + p1.description + ') cannot pair with "' + cmdr2.name + '" (' + p2.description + ').',
  };
}

/**
 * Returns a numerical sort rank for a card based on its primary type/category.
 * In MTG deckbuilding, standard sort order is:
 * Creatures -> Planeswalkers -> Battles -> Instants -> Sorceries -> Artifacts -> Enchantments -> Other -> Lands.
 * Lands are always assigned the lowest priority (highest number) so they appear at the bottom.
 */
export function getCardCategorySortOrder(card: { type_line?: string }): number {
  const t = (card.type_line || (card as any).typeLine || '').toLowerCase();
  // Lands must be at the bottom of the sort
  if (t.includes('land')) return 99;
  if (t.includes('creature') || t.includes('summon')) return 1;
  if (t.includes('planeswalker')) return 2;
  if (t.includes('battle')) return 3;
  if (t.includes('instant')) return 4;
  if (t.includes('sorcery')) return 5;
  if (t.includes('artifact')) return 6;
  if (t.includes('enchantment')) return 7;
  return 8; // other
}

/**
 * Constructs a clean backend API query term to search for candidate partner/background cards
 * from the database/API without using Scryfall-specific search operators.
 */

export function getCandidatePartnerNames(cmdr: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  all_parts?: { component?: string; name: string; type_line?: string }[];
}): string[] {
  const pInfo = getCardPartnerInfo(cmdr);
  if (!pInfo.canHavePartner) return [];

  switch (pInfo.partnerType) {
    case 'partner':
      return Array.from(KNOWN_GENERIC_PARTNERS);
    case 'choose_background':
      return Array.from(KNOWN_BACKGROUND_ENCHANTMENTS);
    case 'background':
      return Array.from(KNOWN_CHOOSE_BACKGROUND_COMMANDERS);
    case 'friends_forever':
      return Array.from(KNOWN_FRIENDS_FOREVER);
    case 'doctor':
      return Array.from(KNOWN_DOCTORS_COMPANIONS);
    case 'doctors_companion':
      return Array.from(KNOWN_DOCTORS);
    case 'partner_with':
      return pInfo.partnerWithTarget ? [pInfo.partnerWithTarget] : [];
    case 'partner_variant':
      if (pInfo.partnerVariant) {
        return Object.entries(KNOWN_PARTNER_VARIANTS)
          .filter(([_, v]) => v.toLowerCase() === pInfo.partnerVariant?.toLowerCase())
          .map(([k]) => k);
      }
      return [];
    default:
      return [];
  }
}

export function getPartnerApiQuery(cmdr: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  all_parts?: { component?: string; name: string; type_line?: string }[];
}): string | null {
  const pInfo = getCardPartnerInfo(cmdr);
  if (!pInfo.canHavePartner) return null;

  switch (pInfo.partnerType) {
    case 'partner':
      return 'partner';
    case 'partner_variant':
      return pInfo.partnerVariant || 'partner';
    case 'choose_background':
      return 'Background';
    case 'background':
      return 'Choose a Background';
    case 'partner_with':
      if (pInfo.partnerWithTarget) {
        return pInfo.partnerWithTarget;
      }
      return 'partner with';
    case 'doctors_companion':
      return 'Doctor';
    case 'doctor':
      return "Doctor's Companion";
    case 'friends_forever':
      return 'Friends Forever';
    default:
      return null;
  }
}

/**
 * Constructs a Scryfall query to search for all legal partner/background cards
 * that can pair with the given primary commander.
 */
export function getPartnerScryfallQuery(cmdr: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  all_parts?: { component?: string; name: string; type_line?: string }[];
}): string | null {
  const pInfo = getCardPartnerInfo(cmdr);
  if (!pInfo.canHavePartner) return null;

  switch (pInfo.partnerType) {
    case 'partner':
      return 'f:commander is:commander kw:partner -o:"partner with" not:digital';
    case 'choose_background':
      return 'f:commander t:background t:enchantment t:legendary not:digital';
    case 'background':
      return 'f:commander (o:"choose a background" or kw:"choose a background") t:legendary not:digital';
    case 'partner_with':
      if (pInfo.partnerWithTarget) {
        return '!"' + pInfo.partnerWithTarget + '" not:digital';
      }
      return 'f:commander o:"partner with" not:digital';
    case 'doctors_companion':
      return 'f:commander t:"time lord" t:doctor not:digital';
    case 'doctor':
      return 'f:commander (kw:"doctor\'s companion" or o:"doctor\'s companion") not:digital';
    case 'friends_forever':
      return 'f:commander o:"friends forever" not:digital';
    default:
      return null;
  }
}

export function sortCardsByName<T extends { name: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterAvailablePartners<T extends { name: string; type_line?: string; oracle_text?: string; keywords?: string[] }>(
  primaryCommander: { name: string; type_line?: string; oracle_text?: string; keywords?: string[] },
  candidateCards: T[],
  currentPartner?: { name: string } | null
): T[] {
  const primaryNameLower = (primaryCommander.name || '').toLowerCase();
  const currentPartnerLower = (currentPartner?.name || '').toLowerCase();

  return candidateCards.filter((card) => {
    const cardNameLower = (card.name || '').toLowerCase();
    if (cardNameLower === primaryNameLower) return false;
    if (currentPartnerLower && cardNameLower === currentPartnerLower) return false;

    const partnerCheck = canCardsPartnerTogether(primaryCommander, card);
    return partnerCheck.canPartner;
  });
}

export const DECK_COLOR_STYLES: Record<string, string> = {
  '': 'colorless',
  'W': 'white',
  'U': 'blue',
  'B': 'black',
  'R': 'red',
  'G': 'green',
  'WU': 'azorius',
  'UB': 'dimir',
  'BR': 'rakdos',
  'RG': 'gruul',
  'GW': 'selesnya',
  'WB': 'orzhov',
  'UR': 'izzet',
  'BG': 'golgari',
  'RW': 'boros',
  'GU': 'simic',
  'WUB': 'esper',
  'UBR': 'grixis',
  'BRG': 'jund',
  'RGW': 'naya',
  'GWU': 'bant',
  'WBR': 'mardu',
  'URG': 'temur',
  'BGW': 'abzan',
  'RWU': 'jeskai',
  'GUB': 'sultai',
  'UBRG': 'yore',
  'BRGW': 'dune',
  'RGWU': 'ink',
  'GWUB': 'witch',
  'WUBR': 'glint',
  'WUBRG': 'fivecolor',
};

export function getDeckColorStyle(colorIdentity: string[]): string {
  const sorted = sortWUBRG(colorIdentity).join('').toUpperCase();
  if (DECK_COLOR_STYLES[sorted]) return DECK_COLOR_STYLES[sorted];
  const alphaKey = sorted.split('').sort().join('');
  for (const [key, val] of Object.entries(DECK_COLOR_STYLES)) {
    if (key.split('').sort().join('') === alphaKey) {
      return val;
    }
  }
  return 'default';
}

export const MTG_COLOR_NAMES = [
  'Abzan',
  'Azorius',
  'Bant',
  'Black',
  'Blue',
  'Boros',
  'Colorless',
  'Dimir',
  'Esper',
  'Golgari',
  'Green',
  'Grixis',
  'Gruul',
  'Izzet',
  'Jeskai',
  'Jund',
  'Mardu',
  'Naya',
  'Orzhov',
  'Rakdos',
  'Red',
  'Selesnya',
  'Simic',
  'Sultai',
  'Temur',
  'UBRG',
  'WBRG',
  'White',
  'WUBG',
  'WUBR',
  'WUBRG',
  'WURG',
] as const;

export const DECK_COLOR_NAME_MAP: Record<string, string> = {
  '': 'Colorless',
  'W': 'White',
  'U': 'Blue',
  'B': 'Black',
  'R': 'Red',
  'G': 'Green',
  'WU': 'Azorius',
  'UB': 'Dimir',
  'BR': 'Rakdos',
  'RG': 'Gruul',
  'GW': 'Selesnya',
  'WB': 'Orzhov',
  'UR': 'Izzet',
  'BG': 'Golgari',
  'RW': 'Boros',
  'GU': 'Simic',
  'WUB': 'Esper',
  'UBR': 'Grixis',
  'BRG': 'Jund',
  'RGW': 'Naya',
  'GWU': 'Bant',
  'WBR': 'Mardu',
  'URG': 'Temur',
  'BGW': 'Abzan',
  'RWU': 'Jeskai',
  'GUB': 'Sultai',
  'UBRG': 'UBRG',
  'BRGW': 'WBRG',
  'RGWU': 'WURG',
  'GWUB': 'WUBG',
  'WUBR': 'WUBR',
  'WUBRG': 'WUBRG',
};

/**
 * Resolves the deck's primary color or color combination name
 * corresponding to C# API Colors.ColorList() (e.g. 'Izzet', 'Esper', 'White', 'Colorless').
 */
export function getDeckColorName(deck: Deck): string {
  const commanderInfo = getDeckCommander(deck);
  let colorIdentity = commanderInfo.colorIdentity;
  if (!colorIdentity || colorIdentity.length === 0) {
    if (deck.commanderColorIdentity && deck.commanderColorIdentity.length > 0) {
      colorIdentity = deck.commanderColorIdentity;
    } else {
      const allColors = new Set<string>();
      (deck.cards || []).forEach((c) => {
        (c.color_identity || (c as any).colorIdentity || c.colors || []).forEach((col: string) => {
          if (['W', 'U', 'B', 'R', 'G'].includes(col.toUpperCase())) {
            allColors.add(col.toUpperCase());
          }
        });
      });
      colorIdentity = Array.from(allColors);
    }
  }

  const sorted = sortWUBRG(colorIdentity).join('').toUpperCase();
  if (DECK_COLOR_NAME_MAP[sorted]) return DECK_COLOR_NAME_MAP[sorted];
  const alphaKey = sorted.split('').sort().join('');
  for (const [key, val] of Object.entries(DECK_COLOR_NAME_MAP)) {
    if (key.split('').sort().join('') === alphaKey) {
      return val;
    }
  }
  return 'Colorless';
}

export function adjustDeckListBBCode(
  apiOutput: string,
  deckName?: string,
  colorStyle?: string,
  commanderCards: DeckCard[] = [],
  deckCards: DeckCard[] = []
): string {
  let result = apiOutput.trim();

  // Strip existing wrapping [deck...] if returned by backend to prevent double tag nesting
  result = result.replace(/^\[deck[^\]]*\]/i, '').replace(/\[\/deck\]$/i, '').trim();

  // Strip redundant [card] tags if present
  result = result.replace(/\[card\](.*?)\[\/card\]/gi, '$1');

  // If output does not contain category headers (e.g. 'Creature (10)'), categorize using deckCards
  if (!/^[A-Za-z\s]+\s*\(\d+\)/m.test(result) && deckCards.length > 0) {
    const cardMap = new Map<string, DeckCard>();
    deckCards.forEach((c) => cardMap.set((c.name || '').toLowerCase().trim(), c));

    const categoryOrder = [
      'Creature',
      'Planeswalker',
      'Instant',
      'Sorcery',
      'Artifact',
      'Enchantment',
      'Battle',
      'Land',
      'Other',
    ];

    const getCat = (c?: DeckCard): string => {
      if (!c) return 'Other';
      const type = (c.type_line || (c as any).typeLine || '').toLowerCase();
      if (type.includes('land')) return 'Land';
      if (type.includes('creature')) return 'Creature';
      if (type.includes('planeswalker')) return 'Planeswalker';
      if (type.includes('instant')) return 'Instant';
      if (type.includes('sorcery')) return 'Sorcery';
      if (type.includes('artifact')) return 'Artifact';
      if (type.includes('enchantment')) return 'Enchantment';
      if (type.includes('battle')) return 'Battle';
      return 'Other';
    };

    const grouped: Record<string, { qty: number; name: string }[]> = {};
    const lines = result.split(/\r?\n/);
    lines.forEach((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const qty = parseInt(match[1], 10);
        const name = match[2].trim();
        const cardObj = cardMap.get(name.toLowerCase());
        const cat = getCat(cardObj);
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ qty, name });
      }
    });

    const rebuilt: string[] = [];
    categoryOrder.forEach((cat) => {
      const items = grouped[cat];
      if (items && items.length > 0) {
        const total = items.reduce((s, x) => s + x.qty, 0);
        rebuilt.push(`${cat} (${total})`);
        items
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((x) => rebuilt.push(`${x.qty} ${x.name}`));
        rebuilt.push('');
      }
    });

    if (rebuilt.length > 0) {
      result = rebuilt.join('\n').trim();
    }
  }

  // Handle General / Commander section
  if (commanderCards.length > 0) {
    const cmdrNames = new Set(commanderCards.map((c) => c.name.toLowerCase()));
    const cmdrCount = commanderCards.reduce((s, c) => s + c.quantity, 0);
    const cmdrBlock = `General (${cmdrCount})\n` + commanderCards.map((c) => `${c.quantity} ${c.name}`).join('\n');

    if (result.includes('General (0)')) {
      result = result.replace(/General \(0\)/, cmdrBlock);
    } else if (!result.includes('General (')) {
      result = `${cmdrBlock}\n\n${result}`;
    }

    // Deduct commander cards from other sections if they appear in them
    const lines = result.split('\n');
    const newLines = [];
    let currentSectionHeaderIdx = -1;
    let currentSectionCount = 0;
    let isInsideGeneral = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^([A-Za-z\s]+)\s*\((\d+)\)$/);
      if (headerMatch) {
        const secName = headerMatch[1].trim();
        isInsideGeneral = secName === 'General';
        currentSectionCount = parseInt(headerMatch[2], 10);
        currentSectionHeaderIdx = newLines.length;
        newLines.push(line);
        continue;
      }

      if (!isInsideGeneral && line.trim()) {
        const cardMatch = line.match(/^(\d+)\s+(.+)$/);
        if (cardMatch) {
          const qty = parseInt(cardMatch[1], 10);
          const name = cardMatch[2].trim().toLowerCase();
          if (cmdrNames.has(name) && currentSectionHeaderIdx >= 0) {
            currentSectionCount = Math.max(0, currentSectionCount - qty);
            const origHeader = newLines[currentSectionHeaderIdx];
            newLines[currentSectionHeaderIdx] = origHeader.replace(/\(\d+\)/, `(${currentSectionCount})`);
            continue;
          }
        }
      }

      newLines.push(line);
    }
    result = newLines.join('\n');
  }

  const safeDeckName = (deckName || 'Deck').replace(/[\]]/g, '');
  const safeColorStyle = colorStyle || 'default';

  return `[deck=${safeDeckName} style=${safeColorStyle}]\n${result}\n[/deck]`;
}

/**
 * Local plain text picklist generator grouping by Color and Card Type
 */
export function generateDeckPickListLocal(deck: Deck): string {
  const cards = (deck.cards || []).filter((c) => c.category !== 'maybeboard');
  const grouped = {};

  const getColorGroup = (c) => {
    const colors = c.colors || [];
    if (colors.length === 0) {
      const type = (c.type_line || (c as any).typeLine || '').toLowerCase();
      if (type.includes('land')) return 'Colorless (Lands)';
      return 'Colorless (Non-Lands)';
    }
    if (colors.length > 1) return 'Multicolor';
    const colorMap = {
      W: 'White',
      U: 'Blue',
      B: 'Black',
      R: 'Red',
      G: 'Green',
    };
    return colorMap[colors[0]] || 'Other';
  };

  cards.forEach((c) => {
    const grp = getColorGroup(c);
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push(c);
  });

  const sectionOrder = [
    'White',
    'Blue',
    'Black',
    'Red',
    'Green',
    'Multicolor',
    'Colorless (Non-Lands)',
    'Colorless (Lands)',
    'Other',
  ];

  const lines = [];
  lines.push(`// Physical Picklist: ${deck.name}`);
  lines.push(`// Total Cards: ${cards.reduce((s, c) => s + c.quantity, 0)}`);
  lines.push('');

  sectionOrder.forEach((sec) => {
    const list = grouped[sec];
    if (list && list.length > 0) {
      const secCount = list.reduce((s, c) => s + c.quantity, 0);
      lines.push(`// --- ${sec} (${secCount}) ---`);
      list
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((c) => {
          lines.push(`${c.quantity}x ${c.name} [${c.type_line || (c as any).typeLine || 'Card'}]`);
        });
      lines.push('');
    }
  });

  return lines.join('\n').trim();
}

/**
 * Calls remote C# API POST /mtgtools/createdecklist to obtain the BBCode formatted decklist.
 * Formats the deck with the Commander designated under Sideboard and non-split cards trimmed.
 * Throws if the API request fails (no local fallback).
 */
export async function createDeckListApi(deck: Deck): Promise<string> {
  const cardLines = formatCardsForDeckListApi(deck);

  const formData = new FormData();
  const safeName = (deck.name || 'deck').replace(/[^a-zA-Z0-9_-]+/g, '_');
  formData.append('file', new Blob([cardLines], { type: 'text/plain' }), `${safeName}.txt`);

  const res = await apiFetch('/mtgtools/createdecklist', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API error (${res.status}): ${errorText || res.statusText || 'Failed to generate decklist'}`);
  }

  const rawOutput = await res.text();
  const trimmed = rawOutput.trim();

  // Use the output directly from the API generation as it has the deck tags as desired already
  if (/^\[deck/i.test(trimmed)) {
    return trimmed;
  }

  // Fallback wrapping if the API output does not yet contain [deck] tags
  return `[deck=${deck.name || 'Deck'}]\n${trimmed}\n[/deck]`;
}

/**
 * Resolves an MTGNexus URL (thread URL, post anchor, or direct edit URL) into a direct edit page URL.
 * Automatically extracts post IDs (p=... or #p...) and converts to posting.php?mode=edit&p=...
 * In either case, appends autoupdate=deck so the userscript automatically replaces the decklist.
 * If only a topic ID is provided (viewtopic.php?t=...), appends autoupdate=deck so the userscript can auto-navigate.
 */
export function resolveMtgNexusEditUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) return 'https://www.mtgnexus.com';
  let urlStr = rawUrl.trim();
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const url = new URL(urlStr);
    // Normalize hostname to www.mtgnexus.com to ensure cookie / dark mode consistency
    if (url.hostname === 'mtgnexus.com') {
      url.hostname = 'www.mtgnexus.com';
    }

    // Already an edit URL - ensure autoupdate=deck is present
    if (url.pathname.includes('posting.php') && url.searchParams.get('mode') === 'edit') {
      url.searchParams.set('autoupdate', 'deck');
      return url.toString();
    }

    // Check query params for post ID 'p'
    let postId = url.searchParams.get('p');

    // Check hash for post ID (e.g. #p12345 or #12345)
    if (!postId && url.hash) {
      const match = url.hash.match(/p?(\d+)/i);
      if (match) {
        postId = match[1];
      }
    }

    if (postId) {
      return `https://${url.hostname}/posting.php?mode=edit&p=${postId}&autoupdate=deck`;
    }

    // If thread URL with topic ID 't', append autoupdate=deck for userscript auto-redirect
    if (url.pathname.includes('viewtopic.php')) {
      url.searchParams.set('autoupdate', 'deck');
      return url.toString();
    }

    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Calls remote C# API POST /mtgtools/createdeckpicklist to obtain the physical card picklist.
 * Formats the deck with the Commander designated under Sideboard and non-split cards trimmed.
 * Throws if the API request fails (no local fallback).
 */
export async function createDeckPickListApi(deck: Deck): Promise<string> {
  const cardLines = formatCardsForDeckListApi(deck);

  const formData = new FormData();
  const safeName = (deck.name || 'deck').replace(/[^a-zA-Z0-9_-]+/g, '_');
  formData.append('file', new Blob([cardLines], { type: 'text/plain' }), `${safeName}.txt`);

  const res = await apiFetch('/mtgtools/createdeckpicklist', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API error (${res.status}): ${errorText || res.statusText || 'Failed to generate picklist'}`);
  }

  const rawOutput = await res.text();
  return rawOutput.trim();
}

/**
 * Fetch all archived iterations for a deck in descending order of ArchivedAt
 * Supports standard route: GET /deckbuilder/decks/{id}/history
 * and alias route:          GET /deckbuilder/decks/history/{id}
 */
export async function fetchDeckHistory(
  deckId: string,
  useAliasRoute: boolean = false
): Promise<DeckHistoryItem[]> {
  return getRemoteDeckHistory(deckId, useAliasRoute);
}

/**
 * Fetch a specific history snapshot by deck ID and history ID
 * GET /deckbuilder/decks/{id}/history/{historyId}
 */
export async function fetchDeckHistorySnapshot(
  deckId: string,
  historyId: string
): Promise<DeckHistoryItem | null> {
  return getRemoteDeckHistorySnapshot(deckId, historyId);
}

/**
 * Compare two deck iterations via remote API /mtgtools/comparefiles
 */
export { 
  compareDeckIterationsWithApi, 
  formatDeckSummaryTextBlock, 
  compareDeckFilesApi, 
  formatCardsForApiComparison,
  compareDecks,
  CompareDecks
};

/**
 * Compares two deck iterations / snapshots and computes detailed card diffs
 * (added, removed, and quantity modified cards).
 */
export function compareDeckSnapshots(
  olderDeck: { cards?: DeckCard[] } | null | undefined,
  currentDeck: { cards?: DeckCard[] } | null | undefined
): DeckDiff {
  const olderCards = olderDeck?.cards || [];
  const currentCards = currentDeck?.cards || [];

  const olderMap = new Map<string, { qty: number; card: DeckCard }>();
  for (const c of olderCards) {
    const key = `${c.name.toLowerCase()}::${c.category || 'main'}`;
    const existing = olderMap.get(key);
    if (existing) {
      existing.qty += c.quantity;
    } else {
      olderMap.set(key, { qty: c.quantity, card: c });
    }
  }

  const currentMap = new Map<string, { qty: number; card: DeckCard }>();
  for (const c of currentCards) {
    const key = `${c.name.toLowerCase()}::${c.category || 'main'}`;
    const existing = currentMap.get(key);
    if (existing) {
      existing.qty += c.quantity;
    } else {
      currentMap.set(key, { qty: c.quantity, card: c });
    }
  }

  const added: DeckDiffItem[] = [];
  const removed: DeckDiffItem[] = [];
  const changed: DeckDiffItem[] = [];

  let totalAddedCount = 0;
  let totalRemovedCount = 0;

  // Check all cards in current deck vs older snapshot
  currentMap.forEach(({ qty: currQty, card }, key) => {
    const oldEntry = olderMap.get(key);
    if (!oldEntry) {
      added.push({
        cardName: card.name,
        category: card.category || 'main',
        oldQuantity: 0,
        newQuantity: currQty,
        delta: currQty,
        card,
      });
      totalAddedCount += currQty;
    } else if (oldEntry.qty !== currQty) {
      const delta = currQty - oldEntry.qty;
      changed.push({
        cardName: card.name,
        category: card.category || 'main',
        oldQuantity: oldEntry.qty,
        newQuantity: currQty,
        delta,
        card,
      });
      if (delta > 0) {
        totalAddedCount += delta;
      } else {
        totalRemovedCount += Math.abs(delta);
      }
    }
  });

  // Check cards that were removed entirely
  olderMap.forEach(({ qty: oldQty, card }, key) => {
    if (!currentMap.has(key)) {
      removed.push({
        cardName: card.name,
        category: card.category || 'main',
        oldQuantity: oldQty,
        newQuantity: 0,
        delta: -oldQty,
        card,
      });
      totalRemovedCount += oldQty;
    }
  });

  return {
    added,
    removed,
    changed,
    totalAddedCount,
    totalRemovedCount,
  };
}


// ==========================================
// Basic Land Balancing Helper
// ==========================================
export interface BasicLandBalanceResult {
  currentCounts: Record<string, number>;
  recommendedCounts: Record<string, number>;
  totalBasics: number;
}

export function calculateBasicLandBalance(deck: Deck, targetBasics?: number): BasicLandBalanceResult {
  const basicNames: Record<string, string> = {
    W: 'Plains',
    U: 'Island',
    B: 'Swamp',
    R: 'Mountain',
    G: 'Forest',
  };

  const currentCounts: Record<string, number> = {
    Plains: 0,
    Island: 0,
    Swamp: 0,
    Mountain: 0,
    Forest: 0,
  };

  let totalExistingBasics = 0;
  (deck.cards || []).forEach((c) => {
    if (c.category === 'main') {
      const n = c.name.split(' // ')[0].trim();
      if (n in currentCounts) {
        currentCounts[n] += c.quantity || 1;
        totalExistingBasics += c.quantity || 1;
      }
    }
  });

  const totalBasics = targetBasics !== undefined ? targetBasics : totalExistingBasics;
  const recommendedCounts: Record<string, number> = {
    Plains: 0,
    Island: 0,
    Swamp: 0,
    Mountain: 0,
    Forest: 0,
  };

  if (totalBasics <= 0) {
    return { currentCounts, recommendedCounts, totalBasics };
  }

  // Calculate pips for colored spells
  const stats = calculateDeckStats(deck, 'main');
  const pips = stats.colorPips;
  const colors = ['W', 'U', 'B', 'R', 'G'] as const;

  // Check active colors from pips or commander color identity
  const cmdr = getDeckCommander(deck);
  const activeColors = colors.filter(
    (col) => (pips[col] > 0) || (cmdr?.colorIdentity?.includes(col))
  );

  const totalActivePips = activeColors.reduce((sum, col) => sum + (pips[col] || 0), 0);

  if (totalActivePips === 0) {
    const validColors = activeColors.length > 0 ? activeColors : colors;
    const baseShare = Math.floor(totalBasics / validColors.length);
    let rem = totalBasics % validColors.length;
    validColors.forEach((col) => {
      const landName = basicNames[col];
      recommendedCounts[landName] = baseShare + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    });
    return { currentCounts, recommendedCounts, totalBasics };
  }

  let allocated = 0;
  const colorAllocations: { col: typeof colors[number]; exact: number; floor: number; remainder: number }[] = [];

  activeColors.forEach((col) => {
    const colPips = pips[col] || 0;
    const exact = (colPips / totalActivePips) * totalBasics;
    const floor = Math.max(colPips > 0 ? 1 : 0, Math.floor(exact));
    allocated += floor;
    colorAllocations.push({
      col,
      exact,
      floor,
      remainder: exact - floor,
    });
  });

  let remainingToDistribute = totalBasics - allocated;
  colorAllocations.sort((a, b) => b.remainder - a.remainder);

  colorAllocations.forEach((item) => {
    let finalCount = item.floor;
    if (remainingToDistribute > 0) {
      finalCount += 1;
      remainingToDistribute -= 1;
    } else if (remainingToDistribute < 0 && finalCount > 1) {
      finalCount -= 1;
      remainingToDistribute += 1;
    }
    recommendedCounts[basicNames[item.col]] = finalCount;
  });

  return { currentCounts, recommendedCounts, totalBasics };
}

// ==========================================
// Commander Salt Score & Power Level Bracket
// ==========================================
export interface SaltyCardInfo {
  name: string;
  weight: number;
  reason: string;
}

export interface DeckPowerAndSaltResult {
  saltScore: number;
  saltRating: 'Low' | 'Moderate' | 'High' | 'Very High' | 'Salty';
  powerBracket: {
    bracket: number; // 1 to 4
    name: string;
    description: string;
    badgeColor: string;
  };
  saltyCards: SaltyCardInfo[];
}

const SALT_REGISTRY: Record<string, { weight: number; reason: string }> = {
  'Armageddon': { weight: 4.0, reason: 'Mass Land Destruction' },
  'Winter Orb': { weight: 4.0, reason: 'Stax / Mana Lock' },
  'Stasis': { weight: 4.0, reason: 'Total Untap Lock' },
  'Static Orb': { weight: 4.0, reason: 'Stax / Mana Denial' },
  "Thassa's Oracle": { weight: 4.0, reason: 'Compact 2-Card Win Condition' },
  'Tergrid, God of Fright': { weight: 3.8, reason: 'Oppressive Sac/Discard Theft' },
  'Vorinclex, Voice of Hunger': { weight: 3.8, reason: 'Mana Doubling + Opponent Mana Lock' },
  'Jin-Gitaxias, Core Augur': { weight: 3.8, reason: 'Discards All Opponents Hands' },
  'Opposition Agent': { weight: 3.7, reason: 'Search Hate & Card Theft' },
  'Drannith Magistrate': { weight: 3.5, reason: 'Locks Opponents from Casting Commanders' },
  'Blood Moon': { weight: 3.5, reason: 'Nonbasic Land Denial' },
  'Back to Basics': { weight: 3.5, reason: 'Nonbasic Land Denial' },
  'Cyclonic Rift': { weight: 3.2, reason: 'Asymmetrical Instant-Speed Board Wipe' },
  'Rhystic Study': { weight: 3.0, reason: 'High-Tax Continuous Card Advantage' },
  'Smothering Tithe': { weight: 3.0, reason: 'Explosive Treasure Tax Engine' },
  'Dockside Extortionist': { weight: 3.2, reason: 'Explosive Fast Mana' },
  'Mana Crypt': { weight: 3.2, reason: 'Free Fast Mana' },
  'Sol Ring': { weight: 1.5, reason: 'Format Staple Fast Mana' },
  'Mana Drain': { weight: 2.8, reason: 'Efficient Counterspell + Mana Ramp' },
  'Necropotence': { weight: 3.0, reason: 'Massive Card Draw Engine' },
  "Bolas's Citadel": { weight: 3.0, reason: 'Casts Deck from Library' },
  'Demonic Tutor': { weight: 2.5, reason: 'Unconditional Cheap Tutor' },
  'Vampiric Tutor': { weight: 2.5, reason: 'Instant-Speed Cheap Tutor' },
  'Fierce Guardianship': { weight: 2.8, reason: 'Free Counterspell' },
  'Deflecting Swat': { weight: 2.8, reason: 'Free Spell Redirect' },
  'Grand Arbiter Augustin IV': { weight: 3.2, reason: 'Oppressive Tax Commander' },
  'Toxrill, the Corrosive': { weight: 3.0, reason: 'Continuous Board Wipe on End Step' },
  'Urza, Lord High Artificer': { weight: 3.2, reason: 'Infinite Mana Engine + Stax Enabler' },
  'Esper Sentinel': { weight: 2.2, reason: 'Turn 1 Creature Tax Draw' },
  'The One Ring': { weight: 2.5, reason: 'Indestructible Protection + Exponential Draw' },
  'Orcish Bowmasters': { weight: 2.4, reason: 'Punishes All Opponent Card Draw' },
  'Mystic Remora': { weight: 2.0, reason: 'Aggressive Early Game Card Draw' },
  'Teferi\'s Protection': { weight: 2.0, reason: 'Total Immunity Phase-Out' },
  'Farewell': { weight: 2.2, reason: 'Exiles Everything' },
  'Craterhoof Behemoth': { weight: 2.0, reason: 'Instant Lethal Trample Wincon' },
  'Torment of Hailfire': { weight: 2.2, reason: 'Mass Life Loss / Board Wipe Finisher' },
};

export function calculateCommanderSaltAndPower(deck: Deck): DeckPowerAndSaltResult {
  const cards = deck.cards || [];
  const saltyCards: SaltyCardInfo[] = [];
  let rawSaltSum = 0;

  // Track key power level indicators
  let fastManaCount = 0;
  let tutorCount = 0;
  let freeSpellsCount = 0;

  cards.forEach((c) => {
    if (c.category !== 'main' && c.category !== 'commander') return;
    const cleanName = c.name.split(' // ')[0].trim();
    const entry = SALT_REGISTRY[cleanName];
    if (entry) {
      saltyCards.push({
        name: cleanName,
        weight: entry.weight,
        reason: entry.reason,
      });
      rawSaltSum += entry.weight * (c.quantity || 1);
    }

    const lowerName = cleanName.toLowerCase();
    const oracle = (c.oracle_text || (c as any).oracleText || '').toLowerCase();
    const typeLine = (c.type_line || (c as any).typeLine || '').toLowerCase();

    // Fast Mana
    if (['sol ring', 'mana crypt', 'mana vault', 'mox opal', 'mox diamond', 'chrome mox', 'lotus petal', 'jeweled lotus', 'dockside extortionist'].includes(lowerName)) {
      fastManaCount += c.quantity || 1;
    }

    // Tutors
    if (
      ['demonic tutor', 'vampiric tutor', 'mystical tutor', 'worldly tutor', 'enlightened tutor', 'gamble', 'imperial seal'].includes(lowerName) ||
      (oracle.includes('search your library') && !typeLine.includes('land') && (c.cmc || 0) <= 3 && !oracle.includes('basic land'))
    ) {
      tutorCount += c.quantity || 1;
    }

    // Free spells
    if (['fierce guardianship', 'deflecting swat', 'force of will', 'force of negation', 'pact of negation', 'deadly rolie', 'flawless maneuver'].includes(lowerName)) {
      freeSpellsCount += c.quantity || 1;
    }
  });

  saltyCards.sort((a, b) => b.weight - a.weight);

  // Normalize Salt Score (0 to 100 scale)
  const saltScore = Math.min(100, Math.round(rawSaltSum * 2.2));

  let saltRating: DeckPowerAndSaltResult['saltRating'] = 'Low';
  if (saltScore >= 60) saltRating = 'Salty';
  else if (saltScore >= 40) saltRating = 'Very High';
  else if (saltScore >= 25) saltRating = 'High';
  else if (saltScore >= 12) saltRating = 'Moderate';

  // Power Level Bracket Estimation (1 to 4)
  const stats = calculateDeckStats(deck, 'main');
  const avgCmc = typeof stats.averageCmc === 'number' ? stats.averageCmc : parseFloat(String(stats.averageCmc) || '3.5');

  let bracket = 1;
  let name = 'Bracket 1: Casual / Precon';
  let description = 'Battlecruiser EDH, social casual play, few tutors, minimal fast mana.';
  let badgeColor = 'bg-emerald-950 border-emerald-600 text-emerald-300';

  const hasThoracleCombo = cards.some(c => c.name.toLowerCase().includes("thassa's oracle")) &&
    cards.some(c => c.name.toLowerCase().includes('demonic consultation') || c.name.toLowerCase().includes('tainted pact'));

  if (hasThoracleCombo || (fastManaCount >= 4 && tutorCount >= 4 && avgCmc < 2.3)) {
    bracket = 4;
    name = 'Bracket 4: cEDH / Competitive';
    description = 'Tournament viable, turn 2-3 win condition combos, maximum density of fast mana and free counterspells.';
    badgeColor = 'bg-rose-950 border-rose-500 text-rose-300';
  } else if ((fastManaCount >= 2 && tutorCount >= 3) || (avgCmc <= 2.7 && tutorCount >= 2) || freeSpellsCount >= 2) {
    bracket = 3;
    name = 'Bracket 3: High Power / Optimized';
    description = 'Streamlined curve, fast mana engines, efficient tutors, high interaction density.';
    badgeColor = 'bg-amber-950 border-amber-500 text-amber-300';
  } else if (tutorCount >= 1 || fastManaCount >= 1 || avgCmc <= 3.2 || saltyCards.length >= 2) {
    bracket = 2;
    name = 'Bracket 2: Tuned / Focused';
    description = 'Synergy-focused deck with good mana curve, consistent game plan, and solid interaction.';
    badgeColor = 'bg-sky-950 border-sky-500 text-sky-300';
  }

  return {
    saltScore,
    saltRating,
    powerBracket: {
      bracket,
      name,
      description,
      badgeColor,
    },
    saltyCards,
  };
}

// ==========================================
// Deck Gamechangers Analysis (From API Data)
// ==========================================
export type GamechangerCategory = 'gamechanger';

export interface GamechangerCardInfo {
  card: DeckCard;
  category: GamechangerCategory;
  categoryLabel: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  icon: string;
  impactReason: string;
  tier: 'S';
}

export interface GamechangerDefinition {
  category: GamechangerCategory;
  categoryLabel: string;
  impactReason: string;
  icon: string;
  tier: 'S';
}

/**
 * Standard presentation for a Gamechanger card.
 * Gamechangers are unified without dynamic synthetic categories.
 */
export function getScryfallGamechangerDetails(card?: DeckCard): GamechangerDefinition {
  return {
    category: 'gamechanger',
    categoryLabel: 'Gamechanger',
    impactReason: 'High-impact format staple designated Gamechanger',
    icon: '⚡',
    tier: 'S',
  };
}

/**
 * Evaluates whether a card is a Gamechanger strictly from the API property.
 */
export function isCardGamechanger(card: any): boolean {
  if (!card) return false;
  return Boolean(
    card.isGameChanger === true ||
    card.isGameChanger === 'true' ||
    card.IsGameChanger === true ||
    card.IsGameChanger === 'true' ||
    card.isGamechanger === true ||
    card.isGamechanger === 'true' ||
    card.is_gamechanger === true ||
    card.is_gamechanger === 'true' ||
    card.game_changer === true ||
    card.game_changer === 'true' ||
    card.is_game_changer === true ||
    card.is_game_changer === 'true' ||
    card.gameChanger === true ||
    card.IsGamechanger === true ||
    card.GameChanger === true ||
    card.gamechanger === true
  );
}

/**
 * Detects gamechangers in a deck evaluated strictly from API data.
 * All gamechangers are unified in presentation without dynamic categories.
 */
export function detectGamechangers(deck: Deck): GamechangerCardInfo[] {
  if (!deck || !Array.isArray(deck.cards)) return [];

  const results: GamechangerCardInfo[] = [];
  const seenCardNames = new Set<string>();

  deck.cards.forEach((card) => {
    const cat = (card.category || 'main').toLowerCase();
    if (cat === 'sideboard' || cat === 'maybeboard') return;

    const cleanName = (card.name || '').split(' // ')[0].replace(/\s*[(\[].*?[)\]]/g, '').trim();
    if (!cleanName) return;
    const lowerName = cleanName.toLowerCase();
    if (seenCardNames.has(lowerName)) return;

    if (isCardGamechanger(card)) {
      seenCardNames.add(lowerName);
      results.push({
        card,
        category: 'gamechanger',
        categoryLabel: 'Gamechanger',
        badgeBg: 'bg-amber-950/80',
        badgeBorder: 'border-amber-500/50',
        badgeText: 'text-amber-300',
        icon: '⚡',
        impactReason: 'High-impact format staple designated Gamechanger',
        tier: 'S',
      });
    }
  });

  return results.sort((a, b) => {
    const priceA = (a.card.isFoil && a.card.priceUsdFoil) ? a.card.priceUsdFoil : (a.card.priceUsd || 0);
    const priceB = (b.card.isFoil && b.card.priceUsdFoil) ? b.card.priceUsdFoil : (b.card.priceUsd || 0);
    if (priceB !== priceA) return priceB - priceA;
    return a.card.name.localeCompare(b.card.name);
  });
}

/**
 * Mimics Scryfall text search matching:
 * 1. Exact match (!"Card Name" or !Card Name): Matches exact card name (case-insensitive)
 * 2. Exact phrase match ("words in order"): Matches exact phrase in name, type, or rules text
 * 3. Tokenized words search (e.g. "niv parun" or "parun niv"): Matches when all words exist on the card in any order
 */
export function matchesScryfallTextSearch(
  card: { name?: string; type_line?: string; oracle_text?: string },
  query: string
): boolean {
  if (!query || !query.trim()) return true;
  if (!card) return false;

  const rawQuery = query.trim();
  const cardName = (card.name || '').toLowerCase();
  const typeLine = (card.type_line || (card as any).typeLine || '').toLowerCase();
  const oracleText = (card.oracle_text || (card as any).oracleText || '').toLowerCase();
  const fullText = `${cardName} ${typeLine} ${oracleText}`;

  // 1. Exact Name Match Syntax: !"Card Name" or !Card Name
  if (rawQuery.startsWith('!')) {
    const target = rawQuery.slice(1).replace(/^["']|["']$/g, '').trim().toLowerCase();
    if (!target) return true;
    if (cardName === target) return true;
    // Handle double-faced cards (e.g., "Niv-Mizzet // ..." or "Valki, God of Lies // Tibalt...")
    if (cardName.includes('//')) {
      const faces = cardName.split('//').map((f) => f.trim());
      if (faces.some((f) => f === target)) return true;
    }
    return false;
  }

  // 2. Exact Phrase Match: "some phrase"
  if (/^["'].+["']$/.test(rawQuery)) {
    const phrase = rawQuery.replace(/^["']|["']$/g, '').trim().toLowerCase();
    if (!phrase) return true;
    return fullText.includes(phrase);
  }

  // 3. Multi-word search in any order (mimics Scryfall default terms search)
  // Split query into individual word tokens
  const words = rawQuery.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Check if all words appear in the card
  return words.every((word) => {
    // If the word is enclosed in quotes, strip them
    const cleanWord = word.replace(/^["']|["']$/g, '').trim();
    if (!cleanWord) return true;
    return fullText.includes(cleanWord);
  });
}
