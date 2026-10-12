import { ScryfallCard } from '../types/mtg';

/**
 * Set codes for digital-only / Magic Online / MTG Arena exclusive sets.
 */
const DIGITAL_ONLY_SET_CODES = new Set([
  'vma', 'me1', 'me2', 'me3', 'me4', 'tpr', 'pmo', 'pmodo', 'mpr', 'pala',
  'pz1', 'pz2', 'td0', 'td2', 'anb', 'ana', 'xana', 'oana',
  'pw21', 'pw22', 'pw23', 'pw24',
  'ye22', 'ye23', 'ye24', 'ybro', 'yone', 'ywoe', 'ylci', 'ymkm', 'yotj', 'yblb', 'ydsk', 'yfdn',
  'rmh1', 'psdg', 'hjps', 'pnat', 'phead',
  'akr', 'klr', 'sir', 'sis', 'ea1', 'ea2', 'ea3', 'hbg', 'j21', 'prm',
  'ha1', 'ha2', 'ha3', 'ha4', 'ha5', 'ha6', 'ha7',
  'arena', 'mtgo', 'ydft', 'y22', 'y23', 'y24', 'y25'
]);

/**
 * Keywords in set names that indicate digital/online-only sets.
 */
const DIGITAL_SET_NAME_REGEX = /\b(magic online|mtgo|vintage masters|tempest remastered|masters edition|alchemy|vanguard|treasure chest|digital promo|amonkhet remastered|kaladesh remastered|shadows over innistrad remastered|historic anthology|explorer anthology)\b/i;

/**
 * Returns true if a Scryfall card or printing is digital-only / Magic Online / Arena exclusive.
 */
export function isDigitalOnlyCard(card: any): boolean {
  if (!card) return false;

  // 1. Scryfall digital boolean flag
  if (card.digital === true || card.digital === 'true' || card.card_faces?.[0]?.digital === true) {
    return true;
  }

  // 2. Available games array check (must include 'paper' to be physical)
  if (Array.isArray(card.games) && card.games.length > 0) {
    if (!card.games.includes('paper')) return true;
  }

  // 3. Set type check
  const setType = (card.set_type || card.setType || '').toLowerCase();
  if (setType === 'online' || setType === 'vanguard' || setType === 'alchemy' || setType === 'treasure_chest') {
    return true;
  }

  // 4. Set code check
  const setCode = (card.set || card.set_code || card.setCode || '').toLowerCase().trim();
  if (DIGITAL_ONLY_SET_CODES.has(setCode)) {
    return true;
  }

  // 5. Set name check
  const setName = (card.set_name || card.setName || '').toLowerCase();
  if (DIGITAL_SET_NAME_REGEX.test(setName)) {
    return true;
  }

  return false;
}

/**
 * Filters an array of Scryfall cards or prints to include ONLY physical paper cards.
 */
export function filterPaperCardsOnly<T = ScryfallCard>(cards: T[]): T[] {
  if (!Array.isArray(cards)) return [];
  return cards.filter((c) => !isDigitalOnlyCard(c));
}
