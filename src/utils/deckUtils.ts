import { Deck, DeckCard, DeckStats, MTGFormat } from '../types/mtg';

export function calculateDeckStats(deck: Deck): DeckStats {
  const cards = deck.cards || [];

  let totalCards = 0;
  let mainboardCount = 0;
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

    if (card.category === 'main' || card.category === 'commander') {
      mainboardCount += qty;

      const isLand = card.type_line?.toLowerCase().includes('land');
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
      const t = card.type_line || '';
      if (t.includes('Creature')) typeBreakdown.Creature += qty;
      else if (t.includes('Instant')) typeBreakdown.Instant += qty;
      else if (t.includes('Sorcery')) typeBreakdown.Sorcery += qty;
      else if (t.includes('Planeswalker')) typeBreakdown.Planeswalker += qty;
      else if (t.includes('Artifact')) typeBreakdown.Artifact += qty;
      else if (t.includes('Enchantment')) typeBreakdown.Enchantment += qty;
      else if (t.includes('Land')) typeBreakdown.Land += qty;
      else typeBreakdown.Other += qty;
    } else if (card.category === 'sideboard') {
      sideboardCount += qty;
    } else if (card.category === 'maybeboard') {
      maybeboardCount += qty;
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
      const isBasicLand = /Basic Land/i.test(c.type_line);
      const cleanName = c.name.split(' // ')[0].trim();
      cardNameCounts[cleanName] = (cardNameCounts[cleanName] || 0) + c.quantity;

      if (!isBasicLand) {
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

    if (commanderCards.length === 2 || commanderQty === 2) {
      if (nonCommanderMainQty !== 98) {
        illegalCards.push(`Commander decks with 2 commanders (Partner/Background) require exactly 98 other cards in the deck (Current: ${nonCommanderMainQty})`);
      }
    } else if (commanderCards.length === 1 && commanderQty === 1) {
      if (nonCommanderMainQty !== 99) {
        illegalCards.push(`Commander decks require exactly 99 other cards in the deck (Current: ${nonCommanderMainQty})`);
      }
    }

    if (mainboardCount !== 100) {
      illegalCards.push(`Commander decks must have exactly 100 cards total (Current: ${mainboardCount})`);
    }
  } else if (deck.format !== 'casual' && mainboardCount < 60) {
    illegalCards.push(`Constructed decks require at least 60 mainboard cards (Current: ${mainboardCount})`);
  }

  return {
    totalCards,
    mainboardCount,
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
    legalities?: Record<string, string>;
  },
  commanderColorIdentity: string[]
): { isLegal: boolean; reason?: string } {
  if (card.legalities && card.legalities['commander'] === 'banned') {
    return { isLegal: false, reason: 'Card is banned in Commander format' };
  }

  const cardIdentity = (card.color_identity && card.color_identity.length > 0)
    ? card.color_identity
    : (card.colors || []);

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
  partnerType: 'none' | 'partner' | 'partner_with' | 'choose_background' | 'background' | 'friends_forever' | 'doctors_companion' | 'doctor';
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
}): boolean {
  const typeLine = (card.type_line || '').toLowerCase();
  const oracle = (card.oracle_text || '').toLowerCase();

  if (oracle.includes('can be your commander')) {
    return true;
  }

  if (typeLine.includes('legendary') && (typeLine.includes('creature') || typeLine.includes('summon'))) {
    return true;
  }

  return false;
}

/**
 * Analyzes Scryfall metadata (keywords, type_line, oracle_text) to determine
 * whether a card supports Partner, Background, Friends Forever, or Doctor mechanics.
 */
export function getCardPartnerInfo(card: {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
}): CommanderPartnerInfo {
  const typeLine = (card.type_line || '').toLowerCase();
  const oracle = (card.oracle_text || '').toLowerCase();
  const keywords = (card.keywords || []).map((k) => k.toLowerCase());

  // 1. Background enchantment
  if (typeLine.includes('background') && typeLine.includes('enchantment')) {
    return {
      canHavePartner: true,
      partnerType: 'background',
      description: 'Background (Pairs with a Commander having "Choose a Background")',
    };
  }

  // 2. Choose a Background
  if (keywords.includes('choose a background') || oracle.includes('choose a background')) {
    return {
      canHavePartner: true,
      partnerType: 'choose_background',
      description: 'Choose a Background (Pairs with a Legendary Background enchantment)',
    };
  }

  // 3. Partner with [Specific Card Name]
  const partnerWithMatch = (card.oracle_text || '').match(new RegExp('partner with ([^\\n\\r(.,]+)', 'i'));
  if (keywords.includes('partner with') || partnerWithMatch) {
    const target = partnerWithMatch ? partnerWithMatch[1].trim() : undefined;
    return {
      canHavePartner: true,
      partnerType: 'partner_with',
      partnerWithTarget: target,
      description: target ? ('Partner with ' + target) : 'Partner with specific card',
    };
  }

  // 4. Doctor's companion
  if (keywords.includes("doctor's companion") || oracle.includes("doctor's companion")) {
    return {
      canHavePartner: true,
      partnerType: 'doctors_companion',
      description: "Doctor's Companion (Pairs with a Time Lord Doctor)",
    };
  }

  // 5. Time Lord Doctor
  if (typeLine.includes('time lord') && typeLine.includes('doctor')) {
    return {
      canHavePartner: true,
      partnerType: 'doctor',
      description: "Time Lord Doctor (Pairs with a Doctor's Companion)",
    };
  }

  // 6. Friends forever
  if (keywords.includes('friends forever') || oracle.includes('friends forever')) {
    return {
      canHavePartner: true,
      partnerType: 'friends_forever',
      description: 'Friends Forever (Pairs with another Friends Forever commander)',
    };
  }

  // 7. Generic Partner
  if (keywords.includes('partner') || (/partner/i.test(oracle) && !oracle.includes('partner with'))) {
    return {
      canHavePartner: true,
      partnerType: 'partner',
      description: 'Partner (Pairs with any other Commander with Partner)',
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

  // Generic Partner + Generic Partner
  if (p1.partnerType === 'partner' && p2.partnerType === 'partner') {
    return { canPartner: true };
  }

  // Choose a Background + Background Enchantment
  if (
    (p1.partnerType === 'choose_background' && p2.partnerType === 'background') ||
    (p1.partnerType === 'background' && p2.partnerType === 'choose_background')
  ) {
    return { canPartner: true };
  }

  // Partner with [Specific Card]
  if (p1.partnerType === 'partner_with' || p2.partnerType === 'partner_with') {
    const target1 = p1.partnerWithTarget ? p1.partnerWithTarget.toLowerCase() : '';
    const target2 = p2.partnerWithTarget ? p2.partnerWithTarget.toLowerCase() : '';
    const name1 = (cmdr1.name || '').toLowerCase();
    const name2 = (cmdr2.name || '').toLowerCase();

    const matches1 = Boolean(target1 && name2.includes(target1));
    const matches2 = Boolean(target2 && name1.includes(target2));

    if (matches1 || matches2) {
      return { canPartner: true };
    }
    return {
      canPartner: false,
      reason: '"' + cmdr1.name + '" can only partner specifically with "' + (p1.partnerWithTarget || 'its designated partner') + '" (not "' + cmdr2.name + '").',
    };
  }

  // Friends Forever + Friends Forever
  if (p1.partnerType === 'friends_forever' && p2.partnerType === 'friends_forever') {
    return { canPartner: true };
  }

  // Doctor + Doctor's Companion
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
