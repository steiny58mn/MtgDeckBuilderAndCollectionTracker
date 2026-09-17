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
    if (mainboardCount !== 100) {
      illegalCards.push(`Commander decks must have exactly 100 cards (Current: ${mainboardCount})`);
    }
    const hasCommander = cards.some((c) => c.category === 'commander');
    if (!hasCommander) {
      illegalCards.push('Missing designated Commander');
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
    totalPriceUsd: parseFloat(totalPriceUsd.toFixed(2)),
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
  const commanderName = deck.commanderName || commanderCards[0]?.name || null;
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

