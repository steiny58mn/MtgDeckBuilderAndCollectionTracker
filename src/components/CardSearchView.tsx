import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Sparkles, 
  Plus, 
  ExternalLink, 
  ArrowUpDown, 
  Loader2, 
  Info, 
  ChevronRight,
  Layers,
  Bookmark,
  Shield,
  HelpCircle,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Copy,
  X,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Crown,
  Lock,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { ScryfallCard, Deck, MTGFormat, CardRarity, DeckCategory, CardCondition, Binder, DeckCard } from '../types/mtg';
import { searchCards, getAutocomplete, getCardImageUrl, getCardBackImageUrl, SearchResult, fetchAvailablePartnersFromApi, handleCardImageError } from '../services/api';
import { getCommanderData } from '../services/edhrec';
import { getTcgplayerMarketPrice, formatTcgplayerPrice } from '../utils/priceUtils';
import { ManaCostBadge } from './ManaCostBadge';
import { useCardDualClickPeek, DualClickCardModal } from './DualClickCardPopup';
import { ScrollToTopButton } from './ScrollToTopButton';
import { CommanderDeckCount, CardSynergyPercentage } from './EdhrecStats';
import { 
  getDeckCommander, 
  isCardLegalInCommander, 
  canBePrimaryCommander, 
  canCardsPartnerTogether,
  getCardPartnerInfo,
  getPartnerScryfallQuery,
  getCardCategorySortOrder,
  sortWUBRG,
  sortCardsByName,
  filterAvailablePartners,
  canHaveAnyNumberOfCopies
} from '../utils/deckUtils';

interface CardSearchViewProps {
  isActive?: boolean;
  activeDeck: Deck | null;
  activeBinder?: Binder | null;
  binders?: Binder[];
  searchContext?: 'deck' | 'binder';
  onSetSearchContext?: (context: 'deck' | 'binder') => void;
  onSelectBinder?: (binder: Binder) => void;
  onCreateBinder?: (name: string, description?: string) => void;
  onSelectCard: (card: ScryfallCard) => void;
  onQuickAddToDeck?: (card: ScryfallCard, category: DeckCategory) => void;
  onQuickAddToCollection?: (card: ScryfallCard, isFoil?: boolean) => void;
  onReturnToDeck?: () => void;
  onReturnToBinder?: () => void;
  initialTargetCategory?: DeckCategory;
  initialPartnerMode?: boolean;
  onResetPartnerSearchRequest?: () => void;
  onUpdateDeck?: (deck: Deck) => void;
}

const CARD_TYPES = [
  { id: 'creature', label: 'Creature' },
  { id: 'instant', label: 'Instant' },
  { id: 'sorcery', label: 'Sorcery' },
  { id: 'artifact', label: 'Artifact' },
  { id: 'enchantment', label: 'Enchantment' },
  { id: 'planeswalker', label: 'Planeswalker' },
  { id: 'land', label: 'Land' },
  { id: 'battle', label: 'Battle' },
  { id: 'kindred', label: 'Kindred' },
];

const SUPERTYPES = [
  { id: 'legendary', label: 'Legendary' },
  { id: 'basic', label: 'Basic' },
  { id: 'snow', label: 'Snow' },
  { id: 'world', label: 'World' },
  { id: 'ongoing', label: 'Ongoing' },
];

const COMMON_MECHANICS = [
  'draw a card',
  'counter target',
  'destroy',
  'exile',
  'search your library',
  'flying',
  'lifelink',
  'deathtouch',
  'haste',
  'trample',
  'ward',
  'flash',
  'sacrifice',
  '+1/+1 counter',
  'token',
  'scry',
];

const QUICK_MANA_SYMBOLS = ['{W}', '{U}', '{B}', '{R}', '{G}', '{C}', '{X}', '{1}', '{2}', '{3}'];

export const CardSearchView: React.FC<CardSearchViewProps> = ({
  isActive,
  activeDeck,
  activeBinder,
  binders = [],
  searchContext = 'deck',
  onSetSearchContext,
  onSelectBinder,
  onCreateBinder,
  onSelectCard,
  onQuickAddToDeck,
  onQuickAddToCollection,
  onReturnToDeck,
  onReturnToBinder,
  initialTargetCategory = 'main',
  initialPartnerMode = false,
  onResetPartnerSearchRequest,
  onUpdateDeck,
}) => {
  const { peekCard, setPeekCard, wasChordTriggeredRecently, getCardChordProps } = useCardDualClickPeek();
  const isDeckContext = searchContext === 'deck';
  const [targetDeckCategory, setTargetDeckCategory] = useState<DeckCategory>(initialTargetCategory);
  useEffect(() => {
    if (initialTargetCategory) {
      setTargetDeckCategory(initialTargetCategory);
    }
  }, [initialTargetCategory]);
  const isBinderContext = searchContext === 'binder';

  const isCommanderDeck = (activeDeck?.format || '').toLowerCase() === 'commander';
  const commanderInfo = isCommanderDeck ? getDeckCommander(activeDeck) : null;
  const commanderColorIdentity = useMemo(() => {
    if (commanderInfo?.colorIdentity && commanderInfo.colorIdentity.length > 0) {
      return commanderInfo.colorIdentity;
    }
    if (activeDeck?.commanderColorIdentity && activeDeck.commanderColorIdentity.length > 0) {
      return sortWUBRG(activeDeck.commanderColorIdentity);
    }
    return [];
  }, [commanderInfo?.colorIdentity, activeDeck?.commanderColorIdentity]);
  const hasCommander = Boolean(
    commanderInfo?.commanderName ||
    activeDeck?.commanderName ||
    activeDeck?.commanderId ||
    commanderColorIdentity.length > 0
  );
  const commanderCards = useMemo(() => {
    if (!activeDeck) return [];
    const tagged = (activeDeck.cards || []).filter((c) => (c.category || '').toLowerCase() === 'commander');
    if (tagged.length > 0) return tagged;
    if (activeDeck.commanderName) {
      const names = activeDeck.commanderName.split(' // ');
      const primaryName = names[0].split(' + ')[0].trim().toLowerCase();
      const matched = (activeDeck.cards || []).filter(
        (c) => c.name.toLowerCase() === primaryName || c.name.toLowerCase().startsWith(primaryName)
      );
      if (matched.length > 0) return matched;
      return [{
        id: activeDeck.commanderId || 'cmdr-primary',
        name: names[0].split(' + ')[0].trim(),
        category: 'commander',
        quantity: 1,
      } as DeckCard];
    }
    return [];
  }, [activeDeck?.cards, activeDeck?.commanderName, activeDeck?.commanderId]);
  const firstCmdrPartnerInfo = commanderCards.length >= 1 ? getCardPartnerInfo(commanderCards[0]) : null;
  const canHavePartner = isCommanderDeck && commanderCards.length >= 1 && Boolean(firstCmdrPartnerInfo?.canHavePartner);

  // Available Partners Shelf state
  // Hover preview pop-up state with 1-second delay
  const [hoveredCardPreview, setHoveredCardPreview] = useState<{
    card: ScryfallCard;
    x: number;
    y: number;
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingHoverRef = useRef<{ card: ScryfallCard; x: number; y: number } | null>(null);

  const handleCardMouseEnter = (e: React.MouseEvent, card: ScryfallCard) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    pendingHoverRef.current = { card, x: e.clientX, y: e.clientY };
    hoverTimeoutRef.current = setTimeout(() => {
      if (pendingHoverRef.current) {
        setHoveredCardPreview(pendingHoverRef.current);
      }
    }, 500);
  };

  const handleCardMouseMove = (e: React.MouseEvent) => {
    if (pendingHoverRef.current) {
      pendingHoverRef.current.x = e.clientX;
      pendingHoverRef.current.y = e.clientY;
    }
    setHoveredCardPreview((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  };

  const handleCardMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    pendingHoverRef.current = null;
    setHoveredCardPreview(null);
  };

  // Clear hover preview on scroll or window resize
  useEffect(() => {
    const handleDismissPreview = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      pendingHoverRef.current = null;
      setHoveredCardPreview(null);
    };
    window.addEventListener('scroll', handleDismissPreview, true);
    window.addEventListener('resize', handleDismissPreview);
    return () => {
      window.removeEventListener('scroll', handleDismissPreview, true);
      window.removeEventListener('resize', handleDismissPreview);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const isDoubleFacedHover = Boolean(
    hoveredCardPreview?.card.card_faces &&
    hoveredCardPreview.card.card_faces.length > 1 &&
    hoveredCardPreview.card.card_faces[0]?.image_uris &&
    hoveredCardPreview.card.card_faces[1]?.image_uris
  );

  const hoverPreviewPos = hoveredCardPreview
    ? (() => {
        const isWide = isDoubleFacedHover && typeof window !== 'undefined' && window.innerWidth >= 640;
        const popWidth = isWide ? 530 : 280;
        const popHeight = 392;
        const padding = 16;
        const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

        let left = hoveredCardPreview.x + 20;
        if (left + popWidth + padding > winWidth) {
          left = hoveredCardPreview.x - popWidth - 20;
        }
        left = Math.max(padding, Math.min(winWidth - popWidth - padding, left));

        let top = hoveredCardPreview.y - popHeight / 2;
        top = Math.max(padding, Math.min(winHeight - popHeight - padding, top));

        return { left, top };
      })()
    : null;

  const commanderStatsCacheRef = useRef<Map<string, any>>(new Map());
  const primaryCommander = commanderCards[0] || null;
  const currentPartner = commanderCards.length > 1 ? commanderCards[1] : null;

  // Partner option is ONLY eligible when there is strictly 1 commander that has partner/paired options
  const canSearchForPartner = Boolean(
    isDeckContext &&
    isCommanderDeck &&
    primaryCommander &&
    commanderCards.length === 1 &&
    !currentPartner &&
    firstCmdrPartnerInfo?.canHavePartner
  );

  const [isPartnerSectionExpanded, setIsPartnerSectionExpanded] = useState<boolean>(() => canSearchForPartner);
  const [availablePartners, setAvailablePartners] = useState<ScryfallCard[]>([]);
  const [loadingPartners, setLoadingPartners] = useState<boolean>(false);
  const [partnerFilter, setPartnerFilter] = useState<string>('');

  useEffect(() => {
    if (initialPartnerMode && canSearchForPartner) {
      setIsPartnerSectionExpanded(true);
      onResetPartnerSearchRequest?.();
    }
  }, [initialPartnerMode, canSearchForPartner]);

  // When commander can have a partner and no partner is currently selected, auto-show available partners
  useEffect(() => {
    if (canSearchForPartner) {
      setIsPartnerSectionExpanded(true);
    } else {
      setIsPartnerSectionExpanded(false);
    }
  }, [canSearchForPartner]);

  // Load available legal partners/backgrounds strictly from the API (only when exactly 1 commander exists)
  useEffect(() => {
    if (!canSearchForPartner) {
      setAvailablePartners([]);
      setLoadingPartners(false);
      return;
    }

    let isMounted = true;
    setLoadingPartners(true);
    fetchAvailablePartnersFromApi(primaryCommander, currentPartner)
      .then((partners) => {
        if (isMounted) {
          setAvailablePartners(partners);
        }
      })
      .catch((err) => {
        console.error('Failed to load available partners from API:', err);
        if (isMounted) {
          setAvailablePartners([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingPartners(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    canSearchForPartner,
    primaryCommander?.id,
    primaryCommander?.name,
    currentPartner?.id,
    currentPartner?.name,
    firstCmdrPartnerInfo?.canHavePartner,
  ]);

  const handleSelectPrimaryCommander = (card: ScryfallCard) => {
    if (activeDeck && onUpdateDeck) {
      const otherCards = (activeDeck.cards || []).filter((c) => c.category !== 'commander');
      const newCmdrDeckCard: DeckCard = {
        id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: card.id,
        name: card.name,
        set: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        category: 'commander',
        quantity: 1,
        isFoil: false,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        type_line: card.type_line,
        oracle_text: card.oracle_text || card.card_faces?.[0]?.oracle_text,
        keywords: card.keywords,
        colors: card.colors,
        color_identity: card.color_identity,
        rarity: card.rarity,
        imageUrl: getCardImageUrl(card, 'normal'),
        priceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined,
        priceUsdFoil: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : undefined,
      };

      const cmdrIdentity = sortWUBRG(
        card.color_identity && card.color_identity.length > 0
          ? card.color_identity
          : (card.colors || [])
      );

      const updated: Deck = {
        ...activeDeck,
        cards: [...otherCards, newCmdrDeckCard],
        commanderName: card.name,
        commanderArtUrl: getCardImageUrl(card, 'art_crop') || newCmdrDeckCard.imageUrl,
        commanderId: card.id,
        commanderColorIdentity: cmdrIdentity,
        coverCardUrl: getCardImageUrl(card, 'art_crop') || newCmdrDeckCard.imageUrl,
        updatedAt: Date.now(),
      };

      onUpdateDeck(updated);
      setSearchTerm('');
    } else {
      onQuickAddToDeck?.(card, 'commander');
      setSearchTerm('');
    }
  };

  const handleSelectPartner = (partnerCard: ScryfallCard) => {
    if (activeDeck && onUpdateDeck) {
      const existingCmdrs = (activeDeck.cards || []).filter((c) => c.category === 'commander');
      const otherCards = (activeDeck.cards || []).filter((c) => c.category !== 'commander');
      const primaryCmdr = existingCmdrs[0];

      const newPartnerDeckCard: DeckCard = {
        id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: partnerCard.id,
        name: partnerCard.name,
        set: partnerCard.set,
        set_name: partnerCard.set_name,
        collector_number: partnerCard.collector_number,
        category: 'commander',
        quantity: 1,
        isFoil: false,
        mana_cost: partnerCard.mana_cost,
        cmc: partnerCard.cmc,
        type_line: partnerCard.type_line,
        oracle_text: partnerCard.oracle_text || partnerCard.card_faces?.[0]?.oracle_text,
        keywords: partnerCard.keywords,
        colors: partnerCard.colors,
        color_identity: partnerCard.color_identity,
        rarity: partnerCard.rarity,
        imageUrl: getCardImageUrl(partnerCard, 'normal'),
        priceUsd: partnerCard.prices?.usd ? parseFloat(partnerCard.prices.usd) : undefined,
        priceUsdFoil: partnerCard.prices?.usd_foil ? parseFloat(partnerCard.prices.usd_foil) : undefined,
      };

      const newCommanderCards = primaryCmdr ? [primaryCmdr, newPartnerDeckCard] : [newPartnerDeckCard];
      const combinedIdentity = sortWUBRG(
        Array.from(
          new Set(
            newCommanderCards.flatMap((c) => {
              if (c.color_identity && c.color_identity.length > 0) return c.color_identity;
              if (c.colors && c.colors.length > 0) return c.colors;
              if (c.mana_cost) {
                const matches = c.mana_cost.match(/[WUBRG]/gi) || [];
                return matches.map((m) => m.toUpperCase());
              }
              return [];
            })
          )
        )
      );

      const updated: Deck = {
        ...activeDeck,
        cards: [...otherCards, ...newCommanderCards],
        commanderName: newCommanderCards.map((c) => c.name).join(' // '),
        commanderArtUrl: primaryCmdr?.imageUrl || newPartnerDeckCard.imageUrl,
        commanderId: primaryCmdr?.scryfallId || newPartnerDeckCard.scryfallId,
        commanderColorIdentity: combinedIdentity,
        updatedAt: Date.now(),
      };

      onUpdateDeck(updated);
      setSearchTerm('');
    } else {
      onQuickAddToDeck?.(partnerCard, 'commander');
      setSearchTerm('');
    }
  };

  const handleRemovePartner = () => {
    if (!activeDeck || !currentPartner || !onUpdateDeck) return;
    const remainingCards = activeDeck.cards.filter((c) => c.id !== currentPartner.id);
    const primaryCmdr = commanderCards[0];
    const newCommanderColorIdentity = primaryCmdr
      ? sortWUBRG(
          primaryCmdr.color_identity && primaryCmdr.color_identity.length > 0
            ? primaryCmdr.color_identity
            : (primaryCmdr.colors || [])
        )
      : [];
    const updated: Deck = {
      ...activeDeck,
      cards: remainingCards,
      commanderName: primaryCmdr?.name || null,
      commanderArtUrl: primaryCmdr?.imageUrl || null,
      commanderId: primaryCmdr?.scryfallId || null,
      commanderColorIdentity: newCommanderColorIdentity,
      updatedAt: Date.now(),
    };
    onUpdateDeck(updated);
    setIsPartnerSectionExpanded(true);
    setSearchTerm('');
  };

  // Helper to get count of copies of card currently in active deck (across all categories: main, sideboard, maybeboard, commander)
  const getDeckCopies = (card: ScryfallCard): number => {
    if (!activeDeck) return 0;
    const cleanName = card.name.split(' // ')[0].trim().toLowerCase();
    return activeDeck.cards
      .filter((c) => c.name.split(' // ')[0].trim().toLowerCase() === cleanName)
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  // Helper to get count of copies of card in a specific category
  const getDeckCopiesByCategory = (card: ScryfallCard, category: DeckCategory): number => {
    if (!activeDeck) return 0;
    const cleanName = card.name.split(' // ')[0].trim().toLowerCase();
    return activeDeck.cards
      .filter((c) => c.category === category && c.name.split(' // ')[0].trim().toLowerCase() === cleanName)
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  // Helper to determine format limit (1 for singleton/commander, 4 for other formats, 999 for basic lands/unlimited)
  const getDeckLimit = (card: ScryfallCard): number => {
    if (canHaveAnyNumberOfCopies(card)) {
      return 999;
    }
    const isSingleton = activeDeck?.format === 'commander' || activeDeck?.format === 'oathbreaker' || activeDeck?.format === 'brawl';
    return isSingleton ? 1 : 4;
  };

  // Toggle for showing cards that are already at the format limit
  const [showCardsAtLimit, setShowCardsAtLimit] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  
  // When commander changes or is chosen, clear out search box and refresh cleanly
  const prevCommanderId = useRef(activeDeck?.commanderId);
  const prevCommanderCount = useRef(commanderCards.length);
  const prevCommanderIdentity = useRef(commanderColorIdentity.join(''));

  useEffect(() => {
    const cmdrIdChanged = activeDeck?.commanderId !== prevCommanderId.current;
    const cmdrCountChanged = commanderCards.length !== prevCommanderCount.current;
    const identityChanged = commanderColorIdentity.join('') !== prevCommanderIdentity.current;

    if (cmdrIdChanged || cmdrCountChanged || identityChanged) {
      if (searchContext === 'deck' && activeDeck?.format === 'commander') {
        setSortBy(activeDeck?.commanderId ? 'synergy' : 'name');
      }

      // When the Commander is chosen, even for partners, clear out the search box
      if (activeDeck?.commanderId || commanderCards.length > 0) {
        setSearchTerm('');
      }

      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(true);
      prevCommanderId.current = activeDeck?.commanderId;
      prevCommanderCount.current = commanderCards.length;
      prevCommanderIdentity.current = commanderColorIdentity.join('');

      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        executeSearch(1, false, '');
      }, 100);
    }
  }, [activeDeck?.commanderId, commanderCards.length, commanderColorIdentity.join('')]);

  
  // Reset search options when switching context
  const prevSearchContext = useRef(searchContext);
  useEffect(() => {
    if (searchContext !== prevSearchContext.current) {
      setSearchTerm('');
      setSelectedColors([]);
      setSelectedTypes([]);
      setCustomSubtype('');
      setSelectedSupertypes([]);
      setOracleText('');
      setCmcOperator('<=');
      setCmcValue('');
      setCmcMax('');
      setSpecificManaCost('');
      setSelectedRarity('');
      setSelectedFormat(searchContext === 'deck' && activeDeck?.format ? activeDeck.format : '');
      setScopeBySearchTerm(false);
      setSortBy(searchContext === 'binder' ? 'name' : (searchContext === 'deck' && activeDeck?.format === 'commander' ? (activeDeck?.commanderId ? 'synergy' : 'name') : 'edhrec'));
      setSortDir('auto');
      setFilterMatchMode('AND');
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      setPage(1);
      setError(null);
      prevSearchContext.current = searchContext;
    }
  }, [searchContext, activeDeck?.format]);


  
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>(activeDeck?.format || '');

  // Filter results based on format limit and banned list
  const [hideBannedCards, setHideBannedCards] = useState<boolean>(true);
  // Scoping results to commander's color identity
  const [filterCommanderIdentity, setFilterCommanderIdentity] = useState<boolean>(true);

  // Filter Match Logic Mode: AND (All must match) vs OR (Any match)
  const [filterMatchMode, setFilterMatchMode] = useState<'AND' | 'OR'>('AND');

  // Filters state
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [customSubtype, setCustomSubtype] = useState<string>('');
  const [selectedSupertypes, setSelectedSupertypes] = useState<string[]>([]);
  const [oracleText, setOracleText] = useState<string>('');
  const [cmcOperator, setCmcOperator] = useState<'=' | '<=' | '>=' | '<' | '>' | 'range'>('<=');
  const [cmcValue, setCmcValue] = useState<string>('');
  const [cmcMax, setCmcMax] = useState<string>('');
  const [specificManaCost, setSpecificManaCost] = useState<string>('');
  const [selectedRarity, setSelectedRarity] = useState<string>('');
  const [scopeBySearchTerm, setScopeBySearchTerm] = useState<boolean>(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState<boolean>(false);
  const [copiedQuery, setCopiedQuery] = useState<boolean>(false);

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'usd' | 'cmc' | 'rarity' | 'edhrec' | 'released' | 'synergy' | 'commander_decks' | 'category'>(searchContext === 'binder' ? 'name' : (searchContext === 'deck' && activeDeck?.format === 'commander' ? (activeDeck?.commanderId ? 'synergy' : 'name') : 'edhrec'));
  const [sortDir, setSortDir] = useState<'auto' | 'asc' | 'desc'>('auto');
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

const displayedCards = useMemo(() => {
    let list = results.filter((card) => {
      const formatToCheck = activeDeck?.format || selectedFormat;
      if (hideBannedCards && formatToCheck && card.legalities && card.legalities[formatToCheck] === 'banned') {
        return false;
      }
      // When searching specifically for primary commanders, filter to commanders only if no search query
      if (isDeckContext && isCommanderDeck && !hasCommander && !searchTerm.trim() && targetDeckCategory === 'commander') {
        if (!canBePrimaryCommander(card)) {
          return false;
        }
      }

      // Filter out cards not legal based on color identity ONLY when Commander CI filter is active
      if (filterCommanderIdentity && isDeckContext && isCommanderDeck && (commanderColorIdentity.length > 0 || commanderCards.length > 0) && !initialPartnerMode && targetDeckCategory !== 'commander') {
        const legality = isCardLegalInCommander(card, commanderColorIdentity, { allowBanned: true });
        if (!legality.isLegal) {
          return false;
        }
      }
      if (!isDeckContext || !activeDeck || showCardsAtLimit) return true;
      const copies = getDeckCopies(card);
      const limit = getDeckLimit(card);
      return limit >= 999 || copies < limit;
    });

    if (sortBy === 'cmc') {
      list = [...list].sort((a, b) => {
        const cmcA = a.cmc ?? 0;
        const cmcB = b.cmc ?? 0;
        if (cmcA !== cmcB) {
          return sortDir === 'desc' ? cmcB - cmcA : cmcA - cmcB;
        }
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === 'usd') {
      list = [...list].sort((a, b) => {
        const priceA = parseFloat(a.prices?.usd || a.prices?.usd_foil || '0') || 0;
        const priceB = parseFloat(b.prices?.usd || b.prices?.usd_foil || '0') || 0;
        return sortDir === 'asc' ? priceA - priceB : priceB - priceA;
      });
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => {
        return sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [
    results,
    activeDeck?.format,
    selectedFormat,
    hideBannedCards,
    isDeckContext,
    isCommanderDeck,
    hasCommander,
    searchTerm,
    targetDeckCategory,
    filterCommanderIdentity,
    commanderColorIdentity.join(''),
    commanderCards.length,
    initialPartnerMode,
    showCardsAtLimit,
    activeDeck?.cards,
    sortBy,
    sortDir,
  ]);

  const cardsHiddenAtLimit = results.length - displayedCards.length;

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const autocompleteDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-search query builder
  const buildQueryString = (overrideSearchTerm?: string) => {
    let trimmedSearch = (overrideSearchTerm !== undefined ? overrideSearchTerm : searchTerm).trim();
    if (trimmedSearch.startsWith('!')) {
      const rawTarget = trimmedSearch.slice(1).replace(/^["']|["']$/g, '').trim();
      trimmedSearch = `!"${rawTarget}"`;
    } else if (trimmedSearch && !trimmedSearch.startsWith('!') && !/[:><=]/.test(trimmedSearch)) {
      const words = trimmedSearch.match(/"[^"]+"|'[^']+'|\S+/g) || [];
      if (words.length > 1) {
        // Multi-word search: match either card name or all words across rules text
        const oracleClauses = words.map((w) => {
          const clean = w.replace(/^["']|["']$/g, '');
          return w.startsWith('"') || w.startsWith("'") ? `o:"${clean}"` : `o:${clean}`;
        });
        trimmedSearch = `((${trimmedSearch}) or (${oracleClauses.join(' ')}))`;
      }
    }
    const filterClauses: string[] = [];

    // 1. Color clause (c>= for all selected colors in AND mode, or c:X or c:Y in OR mode)
    if (selectedColors.length > 0) {
      if (selectedColors.includes('C')) {
        filterClauses.push('color:c');
      } else {
        if (filterMatchMode === 'OR') {
          filterClauses.push(`(${selectedColors.map((c) => `c:${c}`).join(' or ')})`);
        } else {
          filterClauses.push(`c>=${selectedColors.join('')}`);
        }
      }
    }

    // 2. Card Types (always OR among selected types, e.g. Instant OR Sorcery)
    if (selectedTypes.length > 0) {
      if (selectedTypes.length === 1) {
        filterClauses.push(`type:${selectedTypes[0]}`);
      } else {
        filterClauses.push(`(${selectedTypes.map((t) => `type:${t}`).join(' or ')})`);
      }
    }
    if (customSubtype.trim()) {
      const raw = customSubtype.trim();
      if (/^["'].+["']$/.test(raw)) {
        const clean = raw.replace(/^["']|["']$/g, '').trim();
        filterClauses.push(`type:"${clean}"`);
      } else {
        const terms = raw.match(/"[^"]+"|'[^']+'|\S+/g) || [raw];
        if (terms.length === 1) {
          const clean = terms[0].replace(/^["']|["']$/g, '');
          filterClauses.push(terms[0].startsWith('"') || terms[0].startsWith("'") ? `type:"${clean}"` : `type:${clean}`);
        } else {
          const clauses = terms.map((t) => {
            const isQuoted = t.startsWith('"') || t.startsWith("'");
            const clean = t.replace(/^["']|["']$/g, '');
            return isQuoted ? `type:"${clean}"` : `type:${clean}`;
          });
          filterClauses.push(clauses.join(' '));
        }
      }
    }

    // 3. Supertypes (always OR among selected supertypes)
    if (selectedSupertypes.length > 0) {
      if (selectedSupertypes.length === 1) {
        filterClauses.push(`type:${selectedSupertypes[0]}`);
      } else {
        filterClauses.push(`(${selectedSupertypes.map((st) => `type:${st}`).join(' or ')})`);
      }
    }

    // 4. Oracle / Rules Text
    if (oracleText.trim()) {
      const raw = oracleText.trim();
      if (/^["'].+["']$/.test(raw)) {
        const clean = raw.replace(/^["']|["']$/g, '').trim();
        filterClauses.push(`o:"${clean}"`);
      } else {
        const terms = raw.match(/"[^"]+"|'[^']+'|\S+/g) || [raw];
        if (terms.length === 1) {
          const clean = terms[0].replace(/^["']|["']$/g, '');
          filterClauses.push(terms[0].startsWith('"') || terms[0].startsWith("'") ? `o:"${clean}"` : `o:${clean}`);
        } else {
          const clauses = terms.map((t) => {
            const isQuoted = t.startsWith('"') || t.startsWith("'");
            const clean = t.replace(/^["']|["']$/g, '');
            return isQuoted ? `o:"${clean}"` : `o:${clean}`;
          });
          // Multiple oracle terms must all be present (atomic conjunction)
          filterClauses.push(`(${clauses.join(' ')})`);
        }
      }
    }

    // 5. Mana Cost / CMC
    if (cmcValue !== '') {
      if (cmcOperator === 'range' && cmcMax !== '') {
        filterClauses.push(`(cmc>=${cmcValue} cmc<=${cmcMax})`);
      } else {
        filterClauses.push(`cmc${cmcOperator}${cmcValue}`);
      }
    }
    if (specificManaCost.trim()) {
      filterClauses.push(`mana:${specificManaCost.trim()}`);
    }

    // 6. Rarity
    if (selectedRarity) {
      filterClauses.push(`rarity:${selectedRarity}`);
    }

    // Mandatory boundary clauses (Commander format + color identity scoping)
    const boundaryClauses: string[] = [];
    
    // Always exclude digital-only (Alchemy, etc.) cards (only once)
    if (!trimmedSearch.toLowerCase().includes('not:digital') && !filterClauses.some((c) => c.toLowerCase().includes('not:digital'))) {
      boundaryClauses.push('not:digital');
    }

    // ONLY apply deck-specific format/color identity constraints if we are actively searching for the deck
    if (isDeckContext) {
      if (isCommanderDeck) {
        if (targetDeckCategory === 'commander' || initialPartnerMode) {
          boundaryClauses.push(hideBannedCards ? 'f:commander' : '(f:commander or banned:commander)');
          boundaryClauses.push(hideBannedCards ? 'is:commander' : '(is:commander or (type:legendary (type:creature or o:"can be your commander")))');
        } else if (hasCommander || commanderColorIdentity.length > 0) {
          boundaryClauses.push(hideBannedCards ? 'f:commander' : '(f:commander or banned:commander)');
          if (filterCommanderIdentity && (commanderColorIdentity.length > 0 || commanderCards.length > 0)) {
            const idString = commanderColorIdentity.length === 0
              ? 'c'
              : commanderColorIdentity.map((c) => c.toLowerCase()).join('');
            boundaryClauses.push(`id<=${idString}`);
          }
        } else {
          boundaryClauses.push(hideBannedCards ? 'f:commander' : '(f:commander or banned:commander)');
          if (!trimmedSearch) {
            boundaryClauses.push(hideBannedCards ? 'is:commander' : '(is:commander or (type:legendary (type:creature or o:"can be your commander")))');
          }
        }
      } else {
        const effectiveFormat = selectedFormat || (activeDeck?.format !== 'commander' ? activeDeck?.format : '');
        if (effectiveFormat && effectiveFormat !== 'casual') {
          boundaryClauses.push(hideBannedCards ? `format:${effectiveFormat}` : `(format:${effectiveFormat} or banned:${effectiveFormat})`);
        }
      }
    } else {
      // In binder context, we might still want to apply the explicit format dropdown filter if the user selected one
      if (selectedFormat && selectedFormat !== 'casual') {
        boundaryClauses.push(hideBannedCards ? `format:${selectedFormat}` : `(format:${selectedFormat} or banned:${selectedFormat})`);
      }
    }

    // If no search and no filters at all
    if (!trimmedSearch && filterClauses.length === 0) {
      return boundaryClauses.join(' ').trim();
    }

    const sanitizeQuery = (rawStr: string): string => {
      const tokens = rawStr.split(/\s+/).filter(Boolean);
      let seenDigital = false;
      const resultTokens = tokens.filter((t) => {
        if (t.toLowerCase() === 'not:digital') {
          if (seenDigital) return false;
          seenDigital = true;
        }
        return true;
      });
      return resultTokens.join(' ').trim();
    };

    // Combine with filterMatchMode (AND vs OR)
    if (filterMatchMode === 'OR') {
      const orClauses: string[] = [];
      if (trimmedSearch && !scopeBySearchTerm) {
        orClauses.push(trimmedSearch);
      }
      orClauses.push(...filterClauses);

      if (orClauses.length === 0) {
        const parts: string[] = [];
        if (trimmedSearch && scopeBySearchTerm) parts.push(trimmedSearch);
        parts.push(...boundaryClauses);
        return sanitizeQuery(parts.join(' '));
      }

      const orExpression = orClauses.length === 1 ? orClauses[0] : `(${orClauses.join(' or ')})`;
      const parts: string[] = [];
      if (trimmedSearch && scopeBySearchTerm) parts.push(trimmedSearch);
      parts.push(orExpression);
      parts.push(...boundaryClauses);
      return sanitizeQuery(parts.join(' '));
    } else {
      // AND mode: all active criteria must match
      const parts: string[] = [];
      if (trimmedSearch) parts.push(trimmedSearch);
      parts.push(...filterClauses);
      parts.push(...boundaryClauses);
      return sanitizeQuery(parts.join(' '));
    }
  };

  const currentCompiledQuery = buildQueryString();
  const searchAbortRef = useRef<AbortController | null>(null);

  const executeSearch = async (pageNum = 1, append = false, overrideSearchTerm?: string) => {
    const effectiveSearch = (overrideSearchTerm !== undefined ? overrideSearchTerm : searchTerm).trim();
    const query = buildQueryString(overrideSearchTerm);
    if (!query.trim()) {
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const currentAbort = new AbortController();
    searchAbortRef.current = currentAbort;

    setLoading(true);
    setError(null);

    try {
      const searchSortOrder = (sortBy === 'synergy' || sortBy === 'commander_decks' || sortBy === 'category')
        ? 'edhrec'
        : sortBy;
      
      const res = await searchCards({
        query,
        order: searchSortOrder,
        dir: sortDir,
        page: pageNum,
        unique: isBinderContext ? 'prints' : 'cards',
        signal: currentAbort.signal,
      });

      if (currentAbort.signal.aborted) return;
      
      let processedData = res.data;
      
      // Client-side sorting for Category (Lands at bottom, sorted by name within category)
      if (sortBy === 'category') {
        processedData.sort((a, b) => {
          const priorityA = getCardCategorySortOrder(a);
          const priorityB = getCardCategorySortOrder(b);
          if (priorityA !== priorityB) {
            return sortDir === 'desc' ? priorityB - priorityA : priorityA - priorityB;
          }
          return a.name.localeCompare(b.name);
        });
      }

      // Client-side sorting for Synergy/Commander Decks (fast & cached)
      if (sortBy === 'synergy' && activeDeck?.commanderName) {
        let stats = commanderStatsCacheRef.current.get(activeDeck.commanderName);
        if (!stats) {
          try {
            stats = await getCommanderData(activeDeck.commanderName);
            if (stats) commanderStatsCacheRef.current.set(activeDeck.commanderName, stats);
          } catch {}
        }
        if (stats && stats.cardMap) {
          processedData.sort((a, b) => {
            const aVal = stats.cardMap.get(a.name.toLowerCase()) || 0;
            const bVal = stats.cardMap.get(b.name.toLowerCase()) || 0;
            if (aVal !== bVal) {
              return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return 0;
          });
        }
      } else if (sortBy === 'commander_decks') {
        // Fast sort using edhrec rank or lightweight non-blocking check
        processedData.sort((a, b) => {
          const aRank = (a as any).edhrec_rank ?? (a as any).edhrecRank ?? 999999;
          const bRank = (b as any).edhrec_rank ?? (b as any).edhrecRank ?? 999999;
          if (aRank !== bRank) {
            return sortDir === 'asc' ? bRank - aRank : aRank - bRank;
          }
          return a.name.localeCompare(b.name);
        });
      }


      if (currentAbort.signal.aborted) return;

      // When building a deck (!isBinderContext), strictly ensure unique cards (only first print per name)
      if (!isBinderContext) {
        const seenNames = new Set<string>();
        if (append) {
          for (const card of results) {
            const clean = (card.name || '').toLowerCase().trim();
            if (clean) seenNames.add(clean);
          }
        }
        processedData = processedData.filter((card) => {
          const clean = (card.name || '').toLowerCase().trim();
          if (!clean || seenNames.has(clean)) return false;
          seenNames.add(clean);
          return true;
        });

        // When searching specifically for commander cards in a Commander deck, only show cards eligible to be a commander
        if (isCommanderDeck && !hasCommander && !effectiveSearch && targetDeckCategory === 'commander') {
          processedData = processedData.filter((card) => canBePrimaryCommander(card));
        }

        if (sortBy === 'name') {
          processedData.sort((a, b) => {
            return sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
          });
        } else if (sortBy === 'cmc') {
          processedData.sort((a, b) => {
            const cmcA = a.cmc ?? 0;
            const cmcB = b.cmc ?? 0;
            if (cmcA !== cmcB) {
              return sortDir === 'desc' ? cmcB - cmcA : cmcA - cmcB;
            }
            return a.name.localeCompare(b.name);
          });
        } else if (sortBy === 'usd') {
          processedData.sort((a, b) => {
            const priceA = parseFloat(a.prices?.usd || a.prices?.usd_foil || '0') || 0;
            const priceB = parseFloat(b.prices?.usd || b.prices?.usd_foil || '0') || 0;
            return sortDir === 'asc' ? priceA - priceB : priceB - priceA;
          });
        }

        // Strict client-side verification for oracleText (all words must be present in rules text/type/name)
        if (oracleText.trim() && filterMatchMode === 'AND') {
          const reqWords = oracleText
            .toLowerCase()
            .match(/"[^"]+"|'[^']+'|\S+/g)
            ?.map((w) => w.replace(/^["']|["']$/g, '').trim())
            .filter(Boolean) || [];

          if (reqWords.length > 0) {
            processedData = processedData.filter((card) => {
              const fullCardText = (
                (card.name || '') +
                ' ' +
                (card.type_line || '') +
                ' ' +
                (card.oracle_text || '') +
                ' ' +
                (card.card_faces
                  ? card.card_faces.map((f) => (f.name || '') + ' ' + (f.type_line || '') + ' ' + (f.oracle_text || '')).join(' ')
                  : '')
              ).toLowerCase();
              return reqWords.every((word) => fullCardText.includes(word));
            });
          }
        }

        // Strict client-side card type verification in AND mode (matches at least one selected type)
        if (selectedTypes.length > 0 && filterMatchMode === 'AND') {
          processedData = processedData.filter((card) => {
            const fullTypeLine = (
              (card.type_line || '') +
              ' ' +
              (card.card_faces ? card.card_faces.map((f) => f.type_line || '').join(' ') : '')
            ).toLowerCase();
            return selectedTypes.some((t) => {
              const lower = t.toLowerCase();
              if (lower === 'kindred') {
                return fullTypeLine.includes('kindred') || fullTypeLine.includes('tribal');
              }
              return fullTypeLine.includes(lower);
            });
          });
        }

        // Strict client-side color verification
        if (selectedColors.length > 0 && filterMatchMode === 'AND') {
          if (selectedColors.includes('C')) {
            processedData = processedData.filter((card) => (card.colors || []).length === 0);
          } else {
            processedData = processedData.filter((card) =>
              selectedColors.every((c) => (card.colors || []).includes(c))
            );
          }
        }

        // Filter out cards not legal based on color identity for Commander decks
        if (filterCommanderIdentity && isCommanderDeck && (commanderColorIdentity.length > 0 || commanderCards.length > 0) && !initialPartnerMode && targetDeckCategory !== 'commander') {
          processedData = processedData.filter((card) => {
            return isCardLegalInCommander(card, commanderColorIdentity, { allowBanned: true }).isLegal;
          });
        }
      }

      if (append) {
        setResults((prev) => [...prev, ...processedData]);
      } else {
        setResults(processedData);
      }
      setTotalCount(res.total_cards);
      setHasMore(res.has_more);
      setPage(pageNum);
    } catch (err: any) {
      if (currentAbort.signal.aborted) return;
      setError(err.message || 'Error executing search');
      if (!append) setResults([]);
    } finally {
      if (!currentAbort.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const prevIsActive = useRef(isActive);
  const prevHasCommander = useRef(activeDeck?.format === 'commander' ? Boolean(getDeckCommander(activeDeck).commanderName) : true);

  useEffect(() => {
    const isCmdr = activeDeck?.format === 'commander';
    const hasCommander = isCmdr ? Boolean(getDeckCommander(activeDeck).commanderName) : true;

    if (isActive && !prevIsActive.current) {
      // Just became active - trigger initial search behind the scenes if deck has no commander yet
      if (isCmdr && searchContext === 'deck') {
        if (!hasCommander) {
          executeSearch(1, false);
        }
      }
    }
    
    prevIsActive.current = isActive;
    prevHasCommander.current = hasCommander;
  }, [isActive, activeDeck, searchContext]);

  // Debounced search trigger on any filter update
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      executeSearch(1, false);
    }, 350);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [
    filterMatchMode,
    selectedColors,
    selectedTypes,
    customSubtype,
    selectedSupertypes,
    oracleText,
    cmcOperator,
    cmcValue,
    cmcMax,
    specificManaCost,
    selectedRarity,
    selectedFormat,
    hideBannedCards,
    filterCommanderIdentity,
    scopeBySearchTerm,
    searchTerm,
    sortBy,
    sortDir,
    activeDeck?.id,
    activeDeck?.format,
    activeDeck?.commanderName,
    activeDeck?.commanderId,
    activeDeck?.commanderColorIdentity?.join(''),
    commanderColorIdentity.join(''),
    commanderCards.map((c) => c.id).join(','),
  ]);

  const handleClearSearch = () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchTerm('');
    setPage(1);
    executeSearch(1, false, '');
  };

  // Autocomplete trigger
  useEffect(() => {
    if (autocompleteDebounceRef.current) clearTimeout(autocompleteDebounceRef.current);
    if (!searchTerm || searchTerm.length < 2) {
      setAutocompleteItems([]);
      return;
    }

    autocompleteDebounceRef.current = setTimeout(async () => {
      const items = await getAutocomplete(searchTerm);
      setAutocompleteItems(items);
    }, 180);

    return () => {
      if (autocompleteDebounceRef.current) clearTimeout(autocompleteDebounceRef.current);
    };
  }, [searchTerm]);

  const isColorDisabledByCommander = (colorKey: string) => {
    if (!filterCommanderIdentity) return false;
    if (!isCommanderDeck || !hasCommander) return false;
    if (colorKey === 'C') return false;
    return commanderColorIdentity.length > 0 && !commanderColorIdentity.includes(colorKey);
  };

  const toggleColor = (c: string) => {
    // If selecting a color outside commander identity, automatically toggle off Commander CI restriction so results appear!
    if (isColorDisabledByCommander(c)) {
      setFilterCommanderIdentity(false);
    }
    setSelectedColors((prev) => 
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const toggleType = (t: string) => {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const toggleSupertype = (st: string) => {
    setSelectedSupertypes((prev) =>
      prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
    );
  };

  const handleAppendMechanic = (mechanic: string) => {
    setOracleText((prev) => {
      if (!prev.trim()) return mechanic;
      if (prev.toLowerCase().includes(mechanic.toLowerCase())) return prev;
      return `${prev} ${mechanic}`;
    });
  };

  const handleAppendManaSymbol = (symbol: string) => {
    setSpecificManaCost((prev) => `${prev}${symbol}`);
  };

  const handleResetFilters = () => {
    setSelectedColors([]);
    setSelectedTypes([]);
    setCustomSubtype('');
    setSelectedSupertypes([]);
    setOracleText('');
    setCmcValue('');
    setCmcMax('');
    setSpecificManaCost('');
    setSelectedRarity('');
    setSelectedFormat(activeDeck?.format || '');
    setFilterMatchMode('AND');
    setScopeBySearchTerm(false);
  };

  const activeFilterCount = 
    (selectedColors.length > 0 ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (customSubtype.trim() ? 1 : 0) +
    (selectedSupertypes.length > 0 ? 1 : 0) +
    (oracleText.trim() ? 1 : 0) +
    (cmcValue !== '' ? 1 : 0) +
    (specificManaCost.trim() ? 1 : 0) +
    (selectedRarity ? 1 : 0) +
    (selectedFormat && selectedFormat !== (activeDeck?.format || '') && selectedFormat !== 'casual' ? 1 : 0);

  const loadMore = () => {
    if (!loading && hasMore) {
      executeSearch(page + 1, true);
    }
  };

  const handleCopyQuery = () => {
    if (!currentCompiledQuery) return;
    navigator.clipboard.writeText(currentCompiledQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Context & Navigation Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        {/* Left: Mode Switcher & Target info */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Back button */}
          {isDeckContext && onReturnToDeck ? (
            <button
              onClick={onReturnToDeck}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-all shadow-md hover:-translate-x-0.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Deck</span>
            </button>
          ) : isBinderContext && onReturnToBinder ? (
            <button
              onClick={onReturnToBinder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md hover:-translate-x-0.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Binder</span>
            </button>
          ) : null}

          {/* Context Switcher Buttons */}
          <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => onSetSearchContext?.('deck')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isDeckContext
                  ? 'bg-fuchsia-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Deck: {activeDeck ? activeDeck.name : 'None Selected'}</span>
            </button>
            <button
              type="button"
              onClick={() => onSetSearchContext?.('binder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isBinderContext
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Binder: {activeBinder ? activeBinder.name : 'Main Binder'}</span>
            </button>
          </div>

          {/* Target Info details */}
          {isDeckContext && activeDeck && (
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 capitalize font-medium">
                {activeDeck.format}
              </span>
            </div>
          )}

          {isBinderContext && binders.length > 1 && onSelectBinder && (
            <select
              value={activeBinder?.id || ''}
              onChange={(e) => {
                const b = binders.find((x) => x.id === e.target.value);
                if (b) onSelectBinder(b);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
            >
              {binders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.cardCount || 0} cards)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Commander status badge or limit toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {isDeckContext && activeDeck && (
            <>
              {/* Show cards at limit checkbox */}
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-medium cursor-pointer select-none transition-colors">
                <input
                  type="checkbox"
                  checked={showCardsAtLimit}
                  onChange={(e) => setShowCardsAtLimit(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-fuchsia-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Show cards at limit ({isCommanderDeck ? 'Limit 1' : 'Limit 4'})</span>
                {cardsHiddenAtLimit > 0 && !showCardsAtLimit && (
                  <span className="px-1.5 py-0.2 rounded-full bg-fuchsia-950/90 text-fuchsia-400 border border-fuchsia-800 text-[10px] font-mono font-bold">
                    {cardsHiddenAtLimit} hidden
                  </span>
                )}
              </label>

              {/* Commander Color Identity Scoping Toggle */}
              {isCommanderDeck && (hasCommander || commanderColorIdentity.length > 0) && (
                <label
                  className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
                  title="Limit search results to commander's color identity"
                >
                  <input
                    type="checkbox"
                    checked={filterCommanderIdentity}
                    onChange={(e) => setFilterCommanderIdentity(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-fuchsia-500 focus:ring-fuchsia-500/20 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Commander CI</span>
                  <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-800 text-fuchsia-300 font-semibold">
                    {commanderColorIdentity.length > 0 ? commanderColorIdentity.join('') : 'C'}
                  </span>
                </label>
              )}

              {/* Commander Status Badge */}
              {isCommanderDeck && (
                hasCommander ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-fuchsia-950/30 border border-fuchsia-500/40 text-xs text-slate-200">
                    <Crown className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                    <span className="font-bold text-fuchsia-300">{commanderInfo?.commanderName}</span>
                    <span className="font-mono text-[11px] px-1 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300 font-semibold">
                      {commanderColorIdentity.length > 0 ? commanderColorIdentity.join('') : 'C'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-fuchsia-950/40 border border-fuchsia-600/60 text-xs text-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                    <span>No Commander</span>
                    <button
                      onClick={() => {
                        setSelectedTypes(['creature']);
                        executeSearch(1, false);
                      }}
                      className="px-2 py-0.5 rounded bg-fuchsia-500 text-slate-950 text-[10px] font-bold hover:bg-fuchsia-400 transition-colors cursor-pointer"
                    >
                      Find
                    </button>
                  </div>
                )
              )}
            </>
          )}

          {isBinderContext && !activeBinder && onCreateBinder && (
            <button
              onClick={() => onCreateBinder('New Binder')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Create Binder</span>
            </button>
          )}
        </div>
      </div>

      {/* Dedicated Available Partners / Backgrounds Section */}
      {isDeckContext && isCommanderDeck && commanderCards.length > 0 && firstCmdrPartnerInfo?.canHavePartner && (
        <div className="bg-slate-900/90 border border-fuchsia-500/40 rounded-2xl overflow-hidden shadow-xl transition-all">
          {/* Section Header / Expand Bar */}
          <div
            onClick={() => setIsPartnerSectionExpanded(!isPartnerSectionExpanded)}
            className="p-3 bg-gradient-to-r from-fuchsia-950/70 via-slate-900 to-purple-950/50 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/80 transition-colors"
          >
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-100">
                    {firstCmdrPartnerInfo.partnerType === 'choose_background' || firstCmdrPartnerInfo.partnerType === 'background'
                      ? (firstCmdrPartnerInfo.partnerType === 'background' ? 'Available Background Commanders' : 'Available Backgrounds')
                      : firstCmdrPartnerInfo.partnerType === 'partner_variant'
                      ? `Available Partner — ${firstCmdrPartnerInfo.partnerVariant ? firstCmdrPartnerInfo.partnerVariant.charAt(0).toUpperCase() + firstCmdrPartnerInfo.partnerVariant.slice(1) : 'Variant'}`
                      : 'Available Partners'}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 font-semibold">
                    for {commanderCards[0].name}
                  </span>
                  {availablePartners.length > 0 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({availablePartners.length} legal options)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  {currentPartner ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-emerald-400 flex items-center gap-1 font-medium">
                        <Check className="w-3 h-3" />
                        Current Partner: <strong className="text-slate-200">{currentPartner.name}</strong>
                      </span>
                      {onUpdateDeck && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePartner();
                          }}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors cursor-pointer"
                          title="Remove current partner"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-amber-400/90">
                      No partner selected • Choose one below or add anytime later without cluttering search
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                <span>{isPartnerSectionExpanded ? 'Hide Options' : 'Browse Options'}</span>
                {isPartnerSectionExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Section Body */}
          {isPartnerSectionExpanded && (
            <div className="p-3 border-t border-slate-800 bg-slate-950/70">
              {loadingPartners ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
                  <span className="text-xs">Loading legal options from database...</span>
                </div>
              ) : availablePartners.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No compatible partner or background options found.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">
                      Select a partner to combine color identities and automatically update deck card search:
                    </span>
                    <div className="relative">
                      <input
                        type="text"
                        value={partnerFilter}
                        onChange={(e) => setPartnerFilter(e.target.value)}
                        placeholder="Filter by name..."
                        className="bg-slate-900 border border-slate-800 rounded-lg text-xs px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 w-44"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {partnerFilter && (
                        <button
                          type="button"
                          onClick={() => setPartnerFilter('')}
                          className="absolute right-2 top-1 text-slate-400 hover:text-slate-200 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Horizontal Scrollable Shelf of Partners */}
                  <div className="flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
                    {sortCardsByName<ScryfallCard>(
                      filterAvailablePartners(
                        primaryCommander,
                        availablePartners.filter((p) => !partnerFilter || p.name.toLowerCase().includes(partnerFilter.toLowerCase())),
                        currentPartner
                      )
                    ).map((pCard) => {
                        const img = getCardImageUrl(pCard, 'normal');

                        return (
                          <div
                            key={pCard.id}
                            className="shrink-0 w-36 bg-slate-900 border border-slate-800 hover:border-fuchsia-500/60 rounded-xl overflow-hidden flex flex-col justify-between transition-all"
                          >
                            <div
                              onClick={() => {
                                handleCardMouseLeave();
                                onSelectCard(pCard);
                              }}
                              onMouseEnter={(e) => handleCardMouseEnter(e, pCard)}
                              onMouseMove={handleCardMouseMove}
                              onMouseLeave={handleCardMouseLeave}
                              className="relative aspect-[5/7] bg-slate-950 overflow-hidden cursor-pointer"
                            >
                              {img ? (
                                <img
                                  src={img}
                                  alt={pCard.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs text-slate-500">
                                  {pCard.name}
                                </div>
                              )}
                              <div className="absolute top-1.5 right-1.5">
                                <ManaCostBadge manaCost={pCard.mana_cost} size="sm" />
                              </div>
                            </div>

                            <div className="p-2 flex flex-col gap-1.5 flex-1 justify-between">
                              <div>
                                <div
                                  onClick={() => {
                                    setHoveredCardPreview(null);
                                    onSelectCard(pCard);
                                  }}
                                  onMouseEnter={(e) => setHoveredCardPreview({ card: pCard, x: e.clientX, y: e.clientY })}
                                  onMouseMove={(e) => setHoveredCardPreview((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { card: pCard, x: e.clientX, y: e.clientY })}
                                  onMouseLeave={() => setHoveredCardPreview(null)}
                                  className="text-[11px] font-bold text-slate-200 line-clamp-1 hover:text-fuchsia-400 cursor-pointer"
                                  title={pCard.name}
                                >
                                  {pCard.name}
                                </div>
                                <div className="text-[10px] text-slate-400 line-clamp-1">
                                  {pCard.type_line?.split('—')[0]}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSelectPartner(pCard)}
                                className="w-full py-1 px-1.5 rounded-lg text-[10px] font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-colors cursor-pointer shadow-sm text-center"
                              >
                                {currentPartner ? 'Switch Partner' : '+ Choose Partner'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search Header Bar */}
      <div className="bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-4">
        {/* Search input with live autocomplete */}
        <div className="relative">
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 focus-within:border-fuchsia-500 focus-within:ring-1 focus-within:ring-fuchsia-500 transition-all">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowAutocomplete(true);
              }}
              onFocus={() => setShowAutocomplete(true)}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setShowAutocomplete(false);
                  executeSearch(1, false);
                }
              }}
              placeholder={isCommanderDeck && !hasCommander ? 'Search legal commanders by name, color, or rules text...' : 'Search 30,000+ Magic cards by name or syntax (e.g. "Rhystic Study", "Lightning Bolt")...'}
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-fuchsia-500 animate-spin shrink-0" />}
            {searchTerm && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 shrink-0 cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowAutocomplete(false);
                executeSearch(1, false);
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 disabled:opacity-50"
              title="Search cards with current filters"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {showAutocomplete && autocompleteItems.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-30 overflow-hidden max-h-60 overflow-y-auto">
              {autocompleteItems.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    const newTerm = `!"${item}"`;
                    setSearchTerm(newTerm);
                    setShowAutocomplete(false);
                    executeSearch(1, false, newTerm);
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between transition-colors"
                >
                  <span>{item}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Primary Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Filter Match Mode (AND vs OR) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-medium">Match:</span>
            <div className="inline-flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 shadow-inner">
              <button
                type="button"
                onClick={() => setFilterMatchMode('AND')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  filterMatchMode === 'AND'
                    ? 'bg-fuchsia-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Cards must match ALL active filter criteria"
              >
                AND (All)
              </button>
              <button
                type="button"
                onClick={() => setFilterMatchMode('OR')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  filterMatchMode === 'OR'
                    ? 'bg-fuchsia-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Cards matching ANY active filter criterion are returned"
              >
                OR (Any)
              </button>
            </div>

            {/* Colors */}
            <div className="flex items-center gap-1 ml-1 flex-wrap">
              {[
                { id: 'W', label: 'W', bg: 'bg-amber-100 text-slate-900 border-fuchsia-300' },
                { id: 'U', label: 'U', bg: 'bg-sky-600 text-white border-sky-400' },
                { id: 'B', label: 'B', bg: 'bg-slate-800 text-slate-100 border-slate-600' },
                { id: 'R', label: 'R', bg: 'bg-rose-600 text-white border-rose-400' },
                { id: 'G', label: 'G', bg: 'bg-emerald-600 text-white border-emerald-400' },
                { id: 'C', label: 'C', bg: 'bg-zinc-700 text-zinc-200 border-zinc-500' },
              ].map((c) => {
                const active = selectedColors.includes(c.id);
                const disabled = isColorDisabledByCommander(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleColor(c.id)}
                    disabled={disabled}
                    className={`w-6 h-6 rounded-md font-bold text-[11px] transition-all border flex items-center justify-center ${
                      disabled
                        ? 'opacity-20 bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed'
                        : active
                        ? `${c.bg} ring-2 ring-fuchsia-400 shadow-md scale-105 cursor-pointer`
                        : 'bg-slate-800 text-slate-400 border-slate-700 opacity-60 hover:opacity-100 cursor-pointer'
                    }`}
                    title={
                      disabled
                        ? `Outside Commander color identity (${commanderColorIdentity.join('') || 'C'})`
                        : `Filter by ${c.label} color`
                    }
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Quick dropdowns + Advanced Filter toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Format */}
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
            >
              <option value="">All Formats</option>
              <option value="commander">Commander / EDH</option>
              <option value="modern">Modern</option>
              <option value="standard">Standard</option>
              <option value="pioneer">Pioneer</option>
              <option value="legacy">Legacy</option>
              <option value="pauper">Pauper</option>
            </select>

            {/* Rarity */}
            <select
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
            >
              <option value="">All Rarities</option>
              <option value="mythic">Mythic</option>
              <option value="rare">Rare</option>
              <option value="uncommon">Uncommon</option>
              <option value="common">Common</option>
            </select>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-fuchsia-400 font-semibold focus:outline-none"
            >
              <option value="edhrec">Global Popularity</option>
              {isCommanderDeck && commanderInfo?.commanderName && <option value="synergy">Commander Synergy %</option>}
              {isCommanderDeck && !commanderInfo?.commanderName && <option value="commander_decks">Commander Popularity</option>}
              <option value="category">Category (Lands at bottom)</option>

              <option value="usd">Price (USD)</option>
              <option value="name">Name (A-Z)</option>
              <option value="cmc">Mana Value (CMC)</option>
              <option value="released">Release Date</option>
            </select>

            <button
              onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Reverse sort direction"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {/* Advanced Filters Button */}
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                isAdvancedFiltersOpen || activeFilterCount > 0
                  ? 'bg-fuchsia-500/15 border-fuchsia-500 text-fuchsia-300 shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-fuchsia-500 text-slate-950 font-extrabold text-[10px]">
                  {activeFilterCount}
                </span>
              )}
              {isAdvancedFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* Hide Banned Cards Toggle */}
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={hideBannedCards}
                onChange={(e) => {
                  const val = e.target.checked;
                  setHideBannedCards(val);
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  setTimeout(() => {
                    executeSearch(1, false);
                  }, 50);
                }}
                className="rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500 bg-slate-900 w-3.5 h-3.5 cursor-pointer"
              />
              <span>Hide Banned ({activeDeck?.format || selectedFormat || 'Commander'})</span>
            </label>
          </div>
        </div>

        {/* Advanced Filters Expandable Panel */}
        {isAdvancedFiltersOpen && (
          <div className="pt-3 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
            {/* Mode Banner & Search Scope */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  {filterMatchMode} MODE
                </span>
                <span className="text-slate-300">
                  {filterMatchMode === 'AND'
                    ? 'Cards must satisfy ALL active filter criteria (Intersection).'
                    : 'Cards matching ANY of the active filter criteria are shown (Union).'}
                </span>
              </div>

              {filterMatchMode === 'OR' && searchTerm.trim() && (
                <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopeBySearchTerm}
                    onChange={(e) => setScopeBySearchTerm(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-fuchsia-500 focus:ring-0"
                  />
                  <span>Scope results by search name/term</span>
                </label>
              )}
            </div>

            {/* Filter Group 1: Card Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Card Types:</span>
                {selectedTypes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTypes([])}
                    className="text-slate-500 hover:text-slate-300 text-[11px]"
                  >
                    Clear types
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CARD_TYPES.map((t) => {
                  const active = selectedTypes.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleType(t.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        active
                          ? 'bg-fuchsia-500 text-slate-950 border-fuchsia-400 font-bold shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Subtype input */}
              <div className="flex items-center gap-2 pt-1 max-w-sm">
                <span className="text-slate-400 text-xs shrink-0">Subtype:</span>
                <input
                  type="text"
                  value={customSubtype}
                  onChange={(e) => setCustomSubtype(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      executeSearch(1, false);
                    }
                  }}
                  placeholder="e.g. Dragon, Elf, Equipment, Aura, Zombie"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-fuchsia-500"
                />
                {customSubtype && (
                  <button
                    type="button"
                    onClick={() => setCustomSubtype('')}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Filter Group 2: Supertypes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Supertypes:</span>
                {selectedSupertypes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSupertypes([])}
                    className="text-slate-500 hover:text-slate-300 text-[11px]"
                  >
                    Clear supertypes
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {SUPERTYPES.map((st) => {
                  const active = selectedSupertypes.includes(st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => toggleSupertype(st.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        active
                          ? 'bg-purple-600 text-white border-purple-400 font-bold shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter Group 3: Card Rules Text (Oracle Text) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Card Text (Oracle / Rules):</span>
                {oracleText && (
                  <button
                    type="button"
                    onClick={() => setOracleText('')}
                    className="text-slate-500 hover:text-slate-300 text-[11px]"
                  >
                    Clear text
                  </button>
                )}
              </div>
              <input
                type="text"
                value={oracleText}
                onChange={(e) => setOracleText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    executeSearch(1, false);
                  }
                }}
                placeholder='Search rules text e.g. "draw a card", "counter target", "destroy all creatures"...'
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-fuchsia-500"
              />

              {/* Quick mechanic tags */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[11px] text-slate-500 font-medium mr-1">Quick keywords:</span>
                {COMMON_MECHANICS.map((mech) => (
                  <button
                    key={mech}
                    type="button"
                    onClick={() => handleAppendMechanic(mech)}
                    className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-fuchsia-300 text-[11px] transition-colors"
                  >
                    + {mech}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Group 4: Mana Cost & Mana Value (CMC) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Mana Cost & Mana Value (CMC):</span>
                {(cmcValue !== '' || specificManaCost) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCmcValue('');
                      setCmcMax('');
                      setSpecificManaCost('');
                    }}
                    className="text-slate-500 hover:text-slate-300 text-[11px]"
                  >
                    Clear mana filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Mana Value (CMC) */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-slate-400 font-medium block">Mana Value (CMC):</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={cmcOperator}
                      onChange={(e) => setCmcOperator(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none"
                    >
                      <option value="<=">&le; (At most)</option>
                      <option value="=">= (Exact)</option>
                      <option value=">=">&ge; (At least)</option>
                      <option value="<">&lt; (Less than)</option>
                      <option value=">">&gt; (Greater than)</option>
                      <option value="range">Range (Between)</option>
                    </select>

                    <input
                      type="number"
                      min="0"
                      max="16"
                      value={cmcValue}
                      onChange={(e) => setCmcValue(e.target.value)}
                      placeholder="e.g. 3"
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-slate-200 focus:outline-none"
                    />

                    {cmcOperator === 'range' && (
                      <>
                        <span className="text-slate-400">to</span>
                        <input
                          type="number"
                          min="0"
                          max="16"
                          value={cmcMax}
                          onChange={(e) => setCmcMax(e.target.value)}
                          placeholder="Max"
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-slate-200 focus:outline-none"
                        />
                      </>
                    )}
                  </div>

                  {/* Quick CMC buttons */}
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    {['0', '1', '2', '3', '4', '5', '6', '7'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCmcValue(val)}
                        className={`w-6 h-6 rounded-md text-[11px] font-bold border transition-colors ${
                          cmcValue === val
                            ? 'bg-fuchsia-500 text-slate-950 border-fuchsia-400'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exact Mana Cost symbols */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-slate-400 font-medium block">Specific Mana Cost symbols:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={specificManaCost}
                      onChange={(e) => setSpecificManaCost(e.target.value)}
                      placeholder="e.g. {2}{U}{U} or {B}{G}"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 placeholder-slate-600 focus:outline-none"
                    />
                    {specificManaCost && (
                      <button
                        type="button"
                        onClick={() => setSpecificManaCost('')}
                        className="text-slate-500 hover:text-slate-300 text-xs shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Quick symbol buttons */}
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    {QUICK_MANA_SYMBOLS.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => handleAppendManaSymbol(sym)}
                        className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-fuchsia-400 text-slate-300 hover:text-fuchsia-300 text-[10px] font-mono transition-colors"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Filters Summary Bar & Reset All */}
            {activeFilterCount > 0 && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-fuchsia-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-fuchsia-400">
                    Active Filters ({activeFilterCount}) · Match: <strong>{filterMatchMode}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset All Filters</span>
                  </button>
                </div>

                {/* Filter tags */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  {/* Colors */}
                  {selectedColors.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      <span>Color: {selectedColors.join(', ')}</span>
                      <button onClick={() => setSelectedColors([])}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  )}

                  {/* Types */}
                  {selectedTypes.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      <span>Type: {t}</span>
                      <button onClick={() => toggleType(t)}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  ))}

                  {/* Subtype */}
                  {customSubtype && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      <span>Subtype: {customSubtype}</span>
                      <button onClick={() => setCustomSubtype('')}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  )}

                  {/* Supertypes */}
                  {selectedSupertypes.map((st) => (
                    <span key={st} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800">
                      <span>Supertype: {st}</span>
                      <button onClick={() => toggleSupertype(st)}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  ))}

                  {/* Text */}
                  {oracleText && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 max-w-xs truncate">
                      <span className="truncate">Text: "{oracleText}"</span>
                      <button onClick={() => setOracleText('')}><X className="w-3 h-3 hover:text-rose-400 shrink-0" /></button>
                    </span>
                  )}

                  {/* CMC */}
                  {cmcValue !== '' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      <span>CMC {cmcOperator} {cmcValue} {cmcOperator === 'range' && cmcMax ? `to ${cmcMax}` : ''}</span>
                      <button onClick={() => { setCmcValue(''); setCmcMax(''); }}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  )}

                  {/* Specific Mana */}
                  {specificManaCost && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                      <span>Mana: {specificManaCost}</span>
                      <button onClick={() => setSpecificManaCost('')}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  )}

                  {/* Rarity */}
                  {selectedRarity && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                      <span>Rarity: {selectedRarity}</span>
                      <button onClick={() => setSelectedRarity('')}><X className="w-3 h-3 hover:text-rose-400" /></button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Live Search Query Preview */}
            {currentCompiledQuery && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono">
                <div className="truncate text-slate-400">
                  <span className="text-slate-500 font-sans mr-1">Search Query:</span>
                  <code className="text-fuchsia-400">{currentCompiledQuery}</code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyQuery}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-sans text-[11px] shrink-0 transition-colors"
                  title="Copy compiled query syntax"
                >
                  {copiedQuery ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedQuery ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Syntax help toggle */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-fuchsia-400 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showSyntaxHelp ? 'Hide Search Syntax Guide' : 'Search Syntax Guide'}</span>
          </button>
        </div>

        {/* Syntax Helper Card */}
        {showSyntaxHelp && (
          <div className="p-3 bg-slate-950 rounded-xl border border-fuchsia-900/40 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-fuchsia-300">Advanced Search Syntax Tips:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-400">
              <div><code>o:&quot;draw a card&quot;</code> — rules text</div>
              <div><code>cmc&lt;=3</code> or <code>cmc=4</code> — mana value</div>
              <div><code>type:legendary creature</code> — sub-types</div>
              <div><code>(type:instant or type:sorcery)</code> — OR syntax</div>
              <div><code>usd&lt;5</code> — price filter</div>
              <div><code>is:commander</code> — legal commanders</div>
              <div><code>pow&gt;tou</code> — power greater than toughness</div>
            </div>
          </div>
        )}
      </div>

      {/* Results Header */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-1 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            {loading
              ? 'Searching Database...'
              : `${displayedCards.length}${displayedCards.length !== totalCount ? ` of ${totalCount.toLocaleString()}` : ''} cards shown`}
            {activeFilterCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-medium">
                {filterMatchMode} ({activeFilterCount} active)
              </span>
            )}
            {cardsHiddenAtLimit > 0 && !showCardsAtLimit && isDeckContext && (
              <span className="ml-2 text-fuchsia-400/90 font-medium">
                ({cardsHiddenAtLimit} at limit hidden)
              </span>
            )}
          </span>
          {isDeckContext && activeDeck && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400">
                · Adding cards to: <strong className="text-fuchsia-300">{activeDeck.name}</strong> ({activeDeck.format})
              </span>
            </div>
          )}
          {isBinderContext && (
            <span className="text-slate-400">
              · Adding to: <strong className="text-emerald-300">{activeBinder?.name || 'Main Binder'}</strong>
            </span>
          )}
        </div>
        {displayedCards.length > 0 && (
          <span>Page {page} of {Math.ceil(totalCount / 175) || 1}</span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 text-center">
          {error}
        </div>
      )}

      {/* Cards Grid */}
      {displayedCards.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-4 sm:gap-5">
          {displayedCards.map((card) => {
            const regVal = getTcgplayerMarketPrice(card, false);
            const foilVal = getTcgplayerMarketPrice(card, true);
            const price = regVal > 0 ? formatTcgplayerPrice(regVal) : '—';
            const foilPrice = foilVal > 0 && foilVal !== regVal ? formatTcgplayerPrice(foilVal) : null;
            const imgUrl = getCardImageUrl(card, 'normal');

            // Deck copy stats
            const deckCopies = getDeckCopies(card);
            const deckLimit = getDeckLimit(card);
            const isAtLimit = deckLimit < 999 && deckCopies >= deckLimit;

            return (
              <div
                key={card.id}
                className="group relative bg-slate-900 border border-slate-800/90 hover:border-fuchsia-500/80 rounded-xl overflow-hidden shadow-lg transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between"
              >
                {/* Image Container with Click to Inspect */}
                <div 
                  onClick={() => {
                    if (wasChordTriggeredRecently()) return;
                    handleCardMouseLeave();
                    onSelectCard(card);
                  }}
                  {...getCardChordProps({
                    name: card.name,
                    imageUrl: getCardImageUrl(card, 'large'),
                    backImageUrl: getCardBackImageUrl(card),
                    scryfallId: card.id,
                    manaCost: card.mana_cost,
                    typeLine: card.type_line,
                    price: card.prices?.usd,
                  })}
                  className="cursor-pointer relative overflow-hidden aspect-[5/7] bg-slate-950"
                  title="Click to inspect, or Right+Left click together to pop up larger image"
                >
                                    {/* Edhrec Stats */}
                  {isCommanderDeck && !hasCommander && /Legendary/i.test(card.type_line) && (
                    <div className="absolute top-1.5 right-1.5 z-10">
                      <CommanderDeckCount commanderName={card.name} />
                    </div>
                  )}
                  {isCommanderDeck && commanderInfo?.commanderName && (
                    <div className="absolute top-1.5 right-1.5 z-10">
                      <CardSynergyPercentage commanderName={commanderInfo?.commanderName || ''} cardName={card.name} />
                    </div>
                  )}
                  <img
                    src={imgUrl}
                    alt={card.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                    onError={(e) => handleCardImageError(e, card)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 text-fuchsia-300 text-xs font-semibold shadow-lg backdrop-blur-xs">
                      Inspect Card
                    </span>
                  </div>

                  {/* Quantity In Deck Overlay Badge */}
                  {isDeckContext && activeDeck && deckCopies > 0 && (
                    <div
                      className={`absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-md flex items-center gap-1 ${
                        isAtLimit
                          ? 'bg-fuchsia-500 text-slate-950 border border-fuchsia-400 font-extrabold'
                          : 'bg-slate-900/95 text-fuchsia-300 border border-fuchsia-500/50 backdrop-blur-xs'
                      }`}
                      title={`${deckCopies} in deck (Format limit: ${deckLimit < 999 ? deckLimit : 'No limit'})`}
                    >
                      <Layers className="w-2.5 h-2.5" />
                      <span>
                        {deckCopies}${deckLimit < 999 ? `/${deckLimit}` : ''} in deck
                      </span>
                    </div>
                  )}

                  {/* Price Tag Overlay */}
                  <div className="absolute bottom-1.5 left-1.5 bg-slate-950/90 backdrop-blur-xs border border-slate-800 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-emerald-400 shadow-sm flex items-center gap-1">
                    {price}
                    {foilPrice && (
                      <span className="text-[10px] text-fuchsia-400 font-normal flex items-center">
                        <Sparkles className="w-2.5 h-2.5 mr-0.5" />{foilPrice}
                      </span>
                    )}
                  </div>

                  {/* Card Number Overlay in Binder Context */}
                  {isBinderContext && (card.collector_number || (card as any).collectorNumber) && (
                    <div
                      className="absolute bottom-1.5 right-1.5 bg-slate-950/90 backdrop-blur-xs border border-slate-800 rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-300 shadow-sm flex items-center gap-0.5"
                      title={`Card #${card.collector_number || (card as any).collectorNumber}`}
                    >
                      <span className="text-slate-500 text-[9px]">#</span>
                      {card.collector_number || (card as any).collectorNumber}
                    </div>
                  )}
                </div>

                {/* Card Info & Quick Actions */}
                <div className="p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <h4 
                      onClick={() => {
                        setHoveredCardPreview(null);
                        onSelectCard(card);
                      }}
                      onMouseEnter={(e) => setHoveredCardPreview({ card, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHoveredCardPreview((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { card, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHoveredCardPreview(null)}
                      className="text-xs font-semibold text-slate-200 line-clamp-1 hover:text-fuchsia-400 cursor-pointer"
                      title={card.name}
                    >
                      {card.name}
                    </h4>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[90px]">{card.type_line?.split('—')[0]}</span>
                    <ManaCostBadge manaCost={card.mana_cost} size="sm" />
                  </div>
                  {isBinderContext && (
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5" title={`${card.set_name || ''} · #${card.collector_number || (card as any).collectorNumber || ''}`}>
                      <div className="flex items-center truncate min-w-0 mr-1.5">
                        <span className="uppercase font-bold mr-1 text-slate-300">{card.set}</span>
                        <span className="truncate text-slate-500">{card.set_name}</span>
                      </div>
                      {(card.collector_number || (card as any).collectorNumber) && (
                        <span className="font-mono font-bold text-slate-300 bg-slate-950/80 px-1 py-0.5 rounded border border-slate-800 shrink-0 text-[10px]">
                          #{card.collector_number || (card as any).collectorNumber}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Contextual In-Deck Counter */}
                  {isDeckContext && activeDeck && (
                    <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/80">
                      <span>In Deck:</span>
                      <span className={`font-mono font-bold ${isAtLimit ? 'text-fuchsia-400' : deckCopies > 0 ? 'text-fuchsia-300' : 'text-slate-500'}`}>
                        {deckCopies} / {deckLimit < 999 ? deckLimit : '∞'}{isAtLimit ? ' (Max)' : ''}
                      </span>
                    </div>
                  )}

                  {/* Contextual Action Button (Deck ONLY when working on deck, Binder ONLY when working on binder) */}
                  <div className="mt-1 pt-1.5 border-t border-slate-800/80">
                    {isDeckContext ? (
                      activeDeck && onQuickAddToDeck ? (
                        (() => {
                          const isCandidatePrimaryCommander =
                            isCommanderDeck && !hasCommander && canBePrimaryCommander(card) && !isAtLimit;

                          const isCandidatePartner =
                            isCommanderDeck &&
                            hasCommander &&
                            commanderInfo.commanderCards.length === 1 &&
                            canCardsPartnerTogether(commanderInfo.commanderCards[0], card).canPartner &&
                            !isAtLimit;

                          if (isCandidatePrimaryCommander) {
                            return (
                              <button
                                onClick={() => handleSelectPrimaryCommander(card)}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/50 hover:bg-fuchsia-500 hover:text-slate-950 text-fuchsia-300 text-xs font-bold transition-all cursor-pointer shadow-sm"
                                title="Assign this card as Commander"
                              >
                                <Crown className="w-3.5 h-3.5" />
                                <span>Assign as Commander</span>
                              </button>
                            );
                          }

                          if (isCandidatePartner) {
                            return (
                              <button
                                onClick={() => handleSelectPartner(card)}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-amber-600 hover:from-fuchsia-500 hover:to-amber-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                                title={`Assign ${card.name} as Partner Commander`}
                              >
                                <Crown className="w-3.5 h-3.5 text-amber-300" />
                                <span>Assign as Partner</span>
                              </button>
                            );
                          }

                          const legality = isCommanderDeck && hasCommander
                            ? isCardLegalInCommander(card, commanderColorIdentity)
                            : { isLegal: true };

                          if (!legality.isLegal) {
                            return (
                              <button
                                disabled
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-900 border border-red-900/50 text-slate-500 text-xs font-medium cursor-not-allowed opacity-60"
                                title={legality.reason}
                              >
                                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                                <span>Illegal in Deck</span>
                              </button>
                            );
                          }

                          const mainCopies = getDeckCopiesByCategory(card, 'main');
                          const sideCopies = getDeckCopiesByCategory(card, 'sideboard');
                          const maybeCopies = getDeckCopiesByCategory(card, 'maybeboard');
                          const canAlsoAssignAsCommander = isCommanderDeck && !hasCommander && canBePrimaryCommander(card) && !isAtLimit;

                          return (
                            <div className="flex flex-col gap-1.5 w-full">
                              <div className="flex items-center gap-1 w-full">
                              <button
                                type="button"
                                onClick={() => onQuickAddToDeck(card, 'main')}
                                disabled={isAtLimit}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-xs font-bold transition-all ${
                                  isAtLimit
                                    ? 'bg-slate-900 border border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                                    : initialTargetCategory === 'main'
                                      ? 'bg-violet-600/30 border border-violet-500/60 hover:bg-violet-500 hover:text-white text-violet-200 cursor-pointer shadow-sm active:scale-95'
                                      : 'bg-slate-800 hover:bg-violet-600 hover:text-white text-slate-200 border border-slate-700/60 cursor-pointer shadow-sm active:scale-95'
                                }`}
                                title={isAtLimit ? `Format limit reached (${deckCopies}/${deckLimit})` : `Add 1 copy to Mainboard${mainCopies > 0 ? ` (Currently: ${mainCopies})` : ''}`}
                              >
                                <Layers className="w-3.5 h-3.5 shrink-0" />
                                {mainCopies > 0 && (
                                  <span className="text-[10px] font-mono font-semibold opacity-85 shrink-0">({mainCopies})</span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => onQuickAddToDeck(card, 'sideboard')}
                                disabled={isAtLimit}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-xs font-bold transition-all ${
                                  isAtLimit
                                    ? 'bg-slate-900 border border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                                    : initialTargetCategory === 'sideboard'
                                      ? 'bg-sky-600/30 border border-sky-500/60 hover:bg-sky-500 hover:text-white text-sky-200 cursor-pointer shadow-sm active:scale-95'
                                      : 'bg-slate-800 hover:bg-sky-600 hover:text-white text-slate-200 border border-slate-700/60 cursor-pointer shadow-sm active:scale-95'
                                }`}
                                title={isAtLimit ? `Format limit reached (${deckCopies}/${deckLimit})` : `Add 1 copy to Sideboard${sideCopies > 0 ? ` (Currently: ${sideCopies})` : ''}`}
                              >
                                <Shield className="w-3.5 h-3.5 shrink-0" />
                                {sideCopies > 0 && (
                                  <span className="text-[10px] font-mono font-semibold opacity-85 shrink-0">({sideCopies})</span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => onQuickAddToDeck(card, 'maybeboard')}
                                disabled={isAtLimit}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-xs font-bold transition-all ${
                                  isAtLimit
                                    ? 'bg-slate-900 border border-slate-800 text-slate-500 opacity-60 cursor-not-allowed'
                                    : initialTargetCategory === 'maybeboard'
                                      ? 'bg-violet-600/30 border border-violet-500/60 hover:bg-violet-500 hover:text-white text-violet-200 cursor-pointer shadow-sm active:scale-95'
                                      : 'bg-slate-800 hover:bg-violet-600 hover:text-white text-slate-200 border border-slate-700/60 cursor-pointer shadow-sm active:scale-95'
                                }`}
                                title={isAtLimit ? `Format limit reached (${deckCopies}/${deckLimit})` : `Add 1 copy to Maybeboard${maybeCopies > 0 ? ` (Currently: ${maybeCopies})` : ''}`}
                              >
                                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                                {maybeCopies > 0 && (
                                  <span className="text-[10px] font-mono font-semibold opacity-85 shrink-0">({maybeCopies})</span>
                                )}
                              </button>

                              {isCandidatePartner && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectPartner(card)}
                                  className="flex-none px-2 py-1.5 rounded-lg text-xs font-bold transition-all bg-gradient-to-r from-fuchsia-600 to-amber-600 hover:from-fuchsia-500 hover:to-amber-500 text-white cursor-pointer shadow-sm active:scale-95"
                                  title={`Assign ${card.name} as Partner Commander`}
                                >
                                  +P
                                </button>
                              )}
                            </div>

                            {canAlsoAssignAsCommander && (
                              <button
                                type="button"
                                onClick={() => handleSelectPrimaryCommander(card)}
                                className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-fuchsia-500/15 hover:bg-fuchsia-500 hover:text-slate-950 text-fuchsia-300 border border-fuchsia-500/30 text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                                title="Assign this card as Commander (replaces current commander)"
                              >
                                <Crown className="w-3 h-3 text-fuchsia-400" />
                                <span>Assign as Commander</span>
                              </button>
                            )}
                          </div>
                          );
                        })()
                      ) : (
                        <div className="text-[11px] text-slate-500 text-center py-1">No deck selected</div>
                      )
                    ) : (
                      // Binder context: ONLY Binder button shown!
                      onQuickAddToCollection && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => onQuickAddToCollection(card, false)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-200 text-[11px] font-bold transition-all cursor-pointer shadow-sm"
                              title={`Add 1 normal copy to ${activeBinder?.name || 'binder'}`}
                            >
                              <Bookmark className="w-3 h-3 text-emerald-400 group-hover:text-emerald-100" />
                              <span>Add</span>
                            </button>
                            {(card.finishes?.includes('foil') || card.foil) && (
                              <button
                                onClick={() => onQuickAddToCollection(card, true)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-fuchsia-600 hover:text-white text-slate-200 text-[11px] font-bold transition-all cursor-pointer shadow-sm"
                                title={`Add 1 foil copy to ${activeBinder?.name || 'binder'}`}
                              >
                                <Sparkles className="w-3 h-3 text-fuchsia-400 group-hover:text-fuchsia-100" />
                                <span>Foil</span>
                              </button>
                            )}
                          </div>
                          {(card.collector_number || (card as any).collectorNumber) && (
                            <div className="text-[10px] font-mono text-center text-slate-400 bg-slate-950/60 py-0.5 px-1.5 rounded border border-slate-800/80 flex items-center justify-center gap-1">
                              <span className="text-slate-500 uppercase tracking-wider text-[9px]">Card #</span>
                              <span className="font-bold text-slate-200">#{card.collector_number || (card as any).collectorNumber}</span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !loading && (
          <div className="text-center py-16 px-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-slate-400 space-y-3">
            <Search className="w-10 h-10 mx-auto text-slate-600" />
            <h3 className="text-base font-semibold text-slate-300">
              {results.length > 0 && cardsHiddenAtLimit > 0
                ? 'All matching cards are already at their deck limit'
                : 'Ready to search Card Database'}
            </h3>
            <p className="text-xs max-w-md mx-auto text-slate-500">
              {results.length > 0 && cardsHiddenAtLimit > 0
                ? 'Check the "Show cards already at limit" box at the top to view cards you have already maxed out.'
                : 'Type a card name, select card types, supertypes, rules text, mana cost, or pick colors above to discover cards with real-time market pricing.'}
            </p>
            {results.length > 0 && cardsHiddenAtLimit > 0 && (
              <button
                onClick={() => setShowCardsAtLimit(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-500 text-slate-950 text-xs font-bold hover:bg-fuchsia-400 transition-colors cursor-pointer"
              >
                <span>Show {cardsHiddenAtLimit} Cards at Limit</span>
              </button>
            )}
          </div>
        )
      )}

      {/* Pagination Load More */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold shadow-lg transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Loading next page...' : 'Load More Cards'}
          </button>
        </div>
      )}

      {/* Hover Card Preview Pop-up */}
      {hoveredCardPreview && hoverPreviewPos && (
        <div
          className="pointer-events-none fixed z-50 transition-opacity duration-150 shadow-2xl rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950/95 backdrop-blur-md p-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: `${hoverPreviewPos.left}px`,
            top: `${hoverPreviewPos.top}px`,
          }}
        >
          {isDoubleFacedHover && hoveredCardPreview.card.card_faces ? (
            <div className="flex gap-2">
              <div className="relative">
                <img
                  src={
                    hoveredCardPreview.card.card_faces[0].image_uris?.large ||
                    hoveredCardPreview.card.card_faces[0].image_uris?.normal ||
                    getCardImageUrl(hoveredCardPreview.card, 'large')
                  }
                  alt={hoveredCardPreview.card.name}
                  className="w-[250px] h-auto rounded-xl object-contain shadow-xl"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 text-[10px] text-slate-300 font-medium">
                  Front
                </span>
              </div>
              <div className="relative">
                <img
                  src={
                    hoveredCardPreview.card.card_faces[1].image_uris?.large ||
                    hoveredCardPreview.card.card_faces[1].image_uris?.normal
                  }
                  alt={`${hoveredCardPreview.card.name} (Back)`}
                  className="w-[250px] h-auto rounded-xl object-contain shadow-xl"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 text-[10px] text-slate-300 font-medium">
                  Back
                </span>
              </div>
            </div>
          ) : (
            <img
              src={getCardImageUrl(hoveredCardPreview.card, 'large')}
              alt={hoveredCardPreview.card.name}
              className="w-[280px] h-auto rounded-xl object-contain shadow-xl"
              loading="eager"
              referrerPolicy="no-referrer"
              onError={(e) => {
                if (hoveredCardPreview.card.id && !e.currentTarget.src.includes('format=image')) {
                  e.currentTarget.src = `https://api.scryfall.com/cards/${hoveredCardPreview.card.id}?format=image&version=large`;
                }
              }}
            />
          )}
        </div>
      )}

      {/* Dual Click Card Popup Modal */}
      <DualClickCardModal card={peekCard} onClose={() => setPeekCard(null)} />

      {/* Floating Go to Top Button */}
      <ScrollToTopButton />
    </div>
  );
};
