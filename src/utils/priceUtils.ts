import { ScryfallCard } from '../types/mtg';

/**
 * Resolves the TCGPlayer Market Price for a given MTG card and finish (regular, foil, etched).
 * Scryfall's prices object directly stores TCGPlayer Market Price data (usd, usd_foil, usd_etched).
 * Falls back across finishes and EUR conversions if a specific finish is missing for the printing.
 */
export function getTcgplayerMarketPrice(
  card: { prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null; eur?: string | null } } | null | undefined,
  isFoil?: boolean,
  isEtched?: boolean
): number {
  if (!card || !card.prices) return 0;
  const p = card.prices;

  if (isEtched) {
    if (p.usd_etched) {
      const val = parseFloat(p.usd_etched);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  if (isFoil) {
    if (p.usd_foil) {
      const val = parseFloat(p.usd_foil);
      if (!isNaN(val) && val > 0) return val;
    }
    if (p.usd_etched) {
      const val = parseFloat(p.usd_etched);
      if (!isNaN(val) && val > 0) return val;
    }
    if (p.usd) {
      const val = parseFloat(p.usd);
      if (!isNaN(val) && val > 0) return val;
    }
  } else {
    if (p.usd) {
      const val = parseFloat(p.usd);
      if (!isNaN(val) && val > 0) return val;
    }
    if (p.usd_etched) {
      const val = parseFloat(p.usd_etched);
      if (!isNaN(val) && val > 0) return val;
    }
    if (p.usd_foil) {
      const val = parseFloat(p.usd_foil);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  if (p.eur) {
    const eurVal = parseFloat(p.eur) * 1.08;
    if (!isNaN(eurVal) && eurVal > 0) return parseFloat(eurVal.toFixed(2));
  }

  return 0;
}

/**
 * Formats a price number into a TCGPlayer USD currency string e.g. "$12.50" or "—".
 */
export function formatTcgplayerPrice(priceNum?: number | null): string {
  if (priceNum === undefined || priceNum === null || isNaN(priceNum) || priceNum <= 0) {
    return '—';
  }
  return `$${priceNum.toFixed(2)}`;
}
