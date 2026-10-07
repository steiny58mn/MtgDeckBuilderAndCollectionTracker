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
  layout?: string;
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
  isGameChanger?: boolean;
  IsGameChanger?: boolean;
  isGamechanger?: boolean;
  is_gamechanger?: boolean;
  is_game_changer?: boolean;
  IsGamechanger?: boolean;
  game_changer?: boolean;
  gameChanger?: boolean;
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
  layout?: string;
  set: string;
  set_name?: string;
  setName?: string;
  collector_number?: string;
  collectorNumber?: string;
  category: DeckCategory;
  quantity: number;
  isFoil?: boolean;
  mana_cost?: string;
  manaCost?: string;
  cmc: number;
  type_line: string;
  typeLine?: string;
  oracle_text?: string;
  keywords?: string[];
  colors?: string[];
  color_identity?: string[];
  colorIdentity?: string[];
  rarity?: CardRarity;
  imageUrl?: string;
  backImageUrl?: string;
  priceUsd?: number;
  priceUsdFoil?: number;
  legalities?: Record<string, string>;
  isGameChanger?: boolean;
  IsGameChanger?: boolean;
  isGamechanger?: boolean;
  is_gamechanger?: boolean;
  is_game_changer?: boolean;
  IsGamechanger?: boolean;
  game_changer?: boolean;
  gameChanger?: boolean;
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
  mtgNexusEditThreadUrl?: string;
  mtgNexusEditThreadURL?: string;
}

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export interface CollectionCard {
  id: string; // unique item id
  binderId?: string; // which binder this belongs to
  scryfallId: string;
  name: string;
  set: string;
  setName: string;
  set_name?: string;
  collectorNumber: string;
  collector_number?: string;
  quantity: number;
  isFoil: boolean;
  condition: CardCondition;
  cmc: number;
  mana_cost?: string;
  manaCost?: string;
  type_line: string;
  typeLine?: string;
  oracle_text?: string;
  oracleText?: string;
  colors?: string[];
  color_identity?: string[];
  colorIdentity?: string[];
  rarity: CardRarity;
  imageUrl?: string;
  acquiredPrice?: number;
  currentPriceUsd?: number;
  medianPriceUsd?: number;
  isPriceEstimated?: boolean;
  addedAt: number;
  notes?: string;
  isGameChanger?: boolean;
  IsGameChanger?: boolean;
  isGamechanger?: boolean;
  is_gamechanger?: boolean;
  is_game_changer?: boolean;
  IsGamechanger?: boolean;
  game_changer?: boolean;
  gameChanger?: boolean;
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
  commanderCount?: number;
  sideboardCount: number;
  maybeboardCount: number;
  averageCmc: number;
  totalPriceUsd: number;
  manaCurve: ManaCurvePoint[];
  colorPips: ColorBreakdown;
  typeBreakdown: Record<string, number>;
  illegalCards: string[];
}

export interface DeckHistoryItem {
  id: string; // history snapshot ID
  historyId?: string;
  deckId: string;
  name: string;
  format: MTGFormat;
  archivedAt: number | string;
  createdAt?: number | string;
  updatedAt?: number | string;
  description?: string;
  commanderName?: string;
  commanderArtUrl?: string;
  commanderColorIdentity?: string[];
  cardCount?: number;
  changeSummary?: string;
  cards?: DeckCard[];
  [key: string]: any;
}

export interface DeckDiffItem {
  cardName: string;
  category: DeckCategory;
  oldQuantity: number;
  newQuantity: number;
  delta: number;
  card?: DeckCard;
}

export interface DeckDiff {
  added: DeckDiffItem[];
  removed: DeckDiffItem[];
  changed: DeckDiffItem[];
  totalAddedCount: number;
  totalRemovedCount: number;
}

export interface DeckComparisonSummaryResult {
  rawApiOutput: string;
  diffText?: string;
  summaryTextBlock: string;
  cutsCount: number;
  addsCount: number;
  netChange: number;
  cutCards: { quantity: number; name: string }[];
  addedCards: { quantity: number; name: string }[];
}
