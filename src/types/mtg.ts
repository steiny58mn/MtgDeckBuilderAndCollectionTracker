export type MTGFormat = 
  | 'commander'
  | 'standard'
  | 'modern'
  | 'pioneer'
  | 'legacy'
  | 'vintage'
  | 'pauper'
  | 'oathbreaker'
  | 'brawl'
  | 'casual';

export type CardRarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
  };
}

export interface ScryfallCardPrices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

export interface ScryfallCard {
  id: string;
  name: string;
  oracle_id?: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  color_identity: string[];
  keywords?: string[];
  rarity: CardRarity;
  set: string;
  set_name: string;
  collector_number: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
  };
  card_faces?: ScryfallCardFace[];
  legalities: Record<string, string>;
  prices: ScryfallCardPrices;
  foil?: boolean;
  nonfoil?: boolean;
  finishes?: string[];
  scryfall_uri?: string;
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardhoarder?: string;
  };
}

export type DeckCategory = 'main' | 'sideboard' | 'maybeboard' | 'commander';

export interface DeckCard {
  id: string; // unique row id
  scryfallId: string;
  name: string;
  set: string;
  set_name?: string;
  collector_number?: string;
  category: DeckCategory;
  quantity: number;
  isFoil?: boolean;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  colors?: string[];
  color_identity?: string[];
  rarity?: CardRarity;
  imageUrl?: string;
  backImageUrl?: string;
  priceUsd?: number;
  priceUsdFoil?: number;
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  format: MTGFormat;
  commanderId?: string; // Scryfall ID of commander
  commanderName?: string;
  commanderArtUrl?: string;
  commanderColorIdentity?: string[];
  cards: DeckCard[];
  createdAt: number;
  updatedAt: number;
  coverCardUrl?: string;
  tags?: string[];
}

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export interface CollectionCard {
  id: string; // unique item id
  binderId?: string; // which binder this belongs to
  scryfallId: string;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  quantity: number;
  isFoil: boolean;
  condition: CardCondition;
  cmc: number;
  mana_cost?: string;
  type_line: string;
  colors?: string[];
  color_identity?: string[];
  rarity: CardRarity;
  imageUrl?: string;
  acquiredPrice?: number;
  currentPriceUsd?: number;
  addedAt: number;
  notes?: string;
}

export interface Binder {
  id: string;
  name: string;
  description?: string;
  cardCount?: number;
  coverCardUrl?: string;
  cards: CollectionCard[];
  createdAt: number;
  updatedAt: number;
}

export interface ManaCurvePoint {
  cmc: string;
  count: number;
}

export interface ColorBreakdown {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

export interface DeckStats {
  totalCards: number;
  mainboardCount: number;
  sideboardCount: number;
  maybeboardCount: number;
  averageCmc: number;
  totalPriceUsd: number;
  manaCurve: ManaCurvePoint[];
  colorPips: ColorBreakdown;
  typeBreakdown: Record<string, number>;
  illegalCards: string[];
}
