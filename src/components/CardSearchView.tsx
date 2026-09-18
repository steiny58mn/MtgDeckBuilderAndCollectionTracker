import React, { useState, useEffect, useRef } from 'react';
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
import { ScryfallCard, Deck, MTGFormat, CardRarity, DeckCategory, CardCondition, Binder } from '../types/mtg';
import { searchCards, getAutocomplete, getCardImageUrl, SearchResult } from '../services/scryfall';
import { getCommanderData } from '../services/edhrec';
import { ManaCostBadge } from './ManaCostBadge';
import { CommanderDeckCount, CardSynergyPercentage } from './EdhrecStats';
import { getDeckCommander, isCardLegalInCommander } from '../utils/deckUtils';

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
}) => {
  const isDeckContext = searchContext === 'deck';
  const isBinderContext = searchContext === 'binder';

  const commanderInfo = activeDeck?.format === 'commander' ? getDeckCommander(activeDeck) : null;
  const isCommanderDeck = activeDeck?.format === 'commander';
  const hasCommander = Boolean(commanderInfo?.commanderName);
  const commanderColorIdentity = commanderInfo?.colorIdentity || [];

  // Helper to get count of copies of card currently in active deck
  const getDeckCopies = (card: ScryfallCard): number => {
    if (!activeDeck) return 0;
    const cleanName = card.name.split(' // ')[0].trim().toLowerCase();
    return activeDeck.cards
      .filter((c) => c.name.split(' // ')[0].trim().toLowerCase() === cleanName)
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  // Helper to determine format limit (1 for singleton/commander, 4 for other formats, 999 for basic lands/unlimited)
  const getDeckLimit = (card: ScryfallCard): number => {
    const isBasicLand = /Basic Land/i.test(card.type_line) || /Basic Snow Land/i.test(card.type_line);
    const hasUnlimitedRule = card.oracle_text 
      ? /A deck can have any number of cards named/i.test(card.oracle_text)
      : false;
    if (isBasicLand || hasUnlimitedRule) {
      return 999;
    }
    const isSingleton = activeDeck?.format === 'commander' || activeDeck?.format === 'oathbreaker' || activeDeck?.format === 'brawl';
    return isSingleton ? 1 : 4;
  };

  // Toggle for showing cards that are already at the format limit
  const [showCardsAtLimit, setShowCardsAtLimit] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  
  // Instantly clear results when commander changes
  const prevCommanderId = useRef(activeDeck?.commanderId);
  useEffect(() => {
    if (activeDeck?.commanderId !== prevCommanderId.current) {
      if (searchContext === 'deck' && activeDeck?.format === 'commander') {
        setSortBy(activeDeck?.commanderId ? 'synergy' : 'commander_decks');
      }
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(true); // show loading immediately
      prevCommanderId.current = activeDeck?.commanderId;
    }
  }, [activeDeck?.commanderId]);

  
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
      setSortBy(searchContext === 'binder' ? 'name' : (searchContext === 'deck' && activeDeck?.format === 'commander' ? (activeDeck?.commanderId ? 'synergy' : 'commander_decks') : 'edhrec'));
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

  // Filter results based on format limit
  const displayedCards = results.filter((card) => {
    if (!isDeckContext || !activeDeck || showCardsAtLimit) return true;
    const copies = getDeckCopies(card);
    const limit = getDeckLimit(card);
    return limit >= 999 || copies < limit;
  });

  const cardsHiddenAtLimit = results.length - displayedCards.length;

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
  const [selectedFormat, setSelectedFormat] = useState<string>(activeDeck?.format || '');
  const [scopeBySearchTerm, setScopeBySearchTerm] = useState<boolean>(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState<boolean>(false);
  const [copiedQuery, setCopiedQuery] = useState<boolean>(false);

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'usd' | 'cmc' | 'rarity' | 'edhrec' | 'released' | 'synergy' | 'commander_decks'>(searchContext === 'binder' ? 'name' : (searchContext === 'deck' && activeDeck?.format === 'commander' ? (activeDeck?.commanderId ? 'synergy' : 'commander_decks') : 'edhrec'));
  const [sortDir, setSortDir] = useState<'auto' | 'asc' | 'desc'>('auto');
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const autocompleteDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-search query builder
  const buildQueryString = (overrideSearchTerm?: string) => {
    const trimmedSearch = (overrideSearchTerm !== undefined ? overrideSearchTerm : searchTerm).trim();
    const filterClauses: string[] = [];

    // 1. Color clause
    if (selectedColors.length > 0) {
      if (selectedColors.includes('C')) {
        filterClauses.push('color:c');
      } else {
        filterClauses.push(`color<=${selectedColors.join('')}`);
      }
    }

    // 2. Card Types
    if (selectedTypes.length > 0) {
      if (selectedTypes.length === 1) {
        filterClauses.push(`type:${selectedTypes[0]}`);
      } else {
        if (filterMatchMode === 'OR') {
          filterClauses.push(`(${selectedTypes.map((t) => `type:${t}`).join(' or ')})`);
        } else {
          selectedTypes.forEach((t) => filterClauses.push(`type:${t}`));
        }
      }
    }
    if (customSubtype.trim()) {
      filterClauses.push(`type:${customSubtype.trim()}`);
    }

    // 3. Supertypes
    if (selectedSupertypes.length > 0) {
      if (selectedSupertypes.length === 1) {
        filterClauses.push(`type:${selectedSupertypes[0]}`);
      } else {
        if (filterMatchMode === 'OR') {
          filterClauses.push(`(${selectedSupertypes.map((st) => `type:${st}`).join(' or ')})`);
        } else {
          selectedSupertypes.forEach((st) => filterClauses.push(`type:${st}`));
        }
      }
    }

    // 4. Oracle / Rules Text
    if (oracleText.trim()) {
      const clean = oracleText.trim().replace(/"/g, '');
      filterClauses.push(`o:"${clean}"`);
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
    
    // Always exclude digital-only (Alchemy, etc.) cards
    boundaryClauses.push('not:digital');

    // ONLY apply deck-specific format/color identity constraints if we are actively searching for the deck
    if (isDeckContext) {
      if (isCommanderDeck && hasCommander) {
        boundaryClauses.push('f:commander');
        const idString = commanderColorIdentity.length === 0
          ? 'c'
          : commanderColorIdentity.map((c) => c.toLowerCase()).join('');
        boundaryClauses.push(`id<=${idString}`);
      } else {
        const effectiveFormat = selectedFormat || (activeDeck?.format !== 'commander' ? activeDeck?.format : '');
        if (effectiveFormat && effectiveFormat !== 'casual') {
          boundaryClauses.push(`format:${effectiveFormat}`);
        }
      }
    } else {
      // In binder context, we might still want to apply the explicit format dropdown filter if the user selected one
      if (selectedFormat && selectedFormat !== 'casual') {
        boundaryClauses.push(`format:${selectedFormat}`);
      }
    }

    // If no search and no filters at all
    if (!trimmedSearch && filterClauses.length === 0) {
      return boundaryClauses.join(' ').trim();
    }

    // Combine with filterMatchMode (AND vs OR)
    if (filterMatchMode === 'OR') {
      const orClauses: string[] = [];
      if (trimmedSearch && !scopeBySearchTerm) {
        orClauses.push(trimmedSearch);
      }
      orClauses.push(...filterClauses);

      if (orClauses.length === 0) {
        const parts: string[] = [...boundaryClauses];
        if (trimmedSearch && scopeBySearchTerm) parts.push(trimmedSearch);
        return parts.join(' ').trim();
      }

      const orExpression = orClauses.length === 1 ? orClauses[0] : `(${orClauses.join(' or ')})`;
      const parts: string[] = [...boundaryClauses];
      if (trimmedSearch && scopeBySearchTerm) parts.push(trimmedSearch);
      parts.push(orExpression);
      return parts.join(' ').trim();
    } else {
      // AND mode: all active criteria must match
      const parts: string[] = [...boundaryClauses];
      if (trimmedSearch) parts.push(trimmedSearch);
      parts.push(...filterClauses);
      return parts.join(' ').trim();
    }
  };

  const currentCompiledQuery = buildQueryString();

  const executeSearch = async (pageNum = 1, append = false, overrideSearchTerm?: string) => {
    const query = buildQueryString(overrideSearchTerm);
    if (!query.trim()) {
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // If sorting by synergy, ask Scryfall to sort by global EDHREC first so the page contains popular cards
      const scryfallSortOrder = (sortBy === 'synergy' || sortBy === 'commander_decks') ? 'edhrec' : sortBy;
      
      const res = await searchCards({
        query,
        order: scryfallSortOrder,
        dir: sortDir,
        page: pageNum,
        unique: isBinderContext ? 'prints' : 'cards'
      });
      
      let processedData = res.data;
      
      // Client-side sorting for Synergy/Commander Decks
      if (sortBy === 'synergy' && activeDeck?.commanderName) {
        const stats = await getCommanderData(activeDeck.commanderName);
        if (stats && stats.cardMap) {
          processedData.sort((a, b) => {
            // First try Synergy (if it's in the 99)
            const aVal = stats.cardMap.get(a.name.toLowerCase()) || 0;
            const bVal = stats.cardMap.get(b.name.toLowerCase()) || 0;
            
            if (aVal !== bVal) {
              return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return 0;
          });
        }
      } else if (sortBy === 'commander_decks') {
        // Fetch deck counts for potential commander cards
        const deckCounts = new Map<string, number>();
        await Promise.all(
          processedData.map(async (card) => {
            const isPotentialCommander = 
              card.type_line?.includes('Legendary') && 
              (card.type_line?.includes('Creature') || 
               card.oracle_text?.toLowerCase().includes('can be your commander') || 
               card.type_line?.includes('Background'));

            if (!isPotentialCommander) {
              deckCounts.set(card.id, 0);
              return;
            }

            try {
              const stats = await getCommanderData(card.name);
              if (stats) {
                deckCounts.set(card.id, stats.numDecks);
              } else {
                deckCounts.set(card.id, 0);
              }
            } catch {
              deckCounts.set(card.id, 0);
            }
          })
        );
        
        processedData.sort((a, b) => {
          const aVal = deckCounts.get(a.id) || 0;
          const bVal = deckCounts.get(b.id) || 0;
          if (aVal !== bVal) {
             return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
          }
          return 0;
        });
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
      setError(err.message || 'Error executing Scryfall search');
      if (!append) setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const prevIsActive = useRef(isActive);
  const prevHasCommander = useRef(activeDeck?.format === 'commander' ? Boolean(getDeckCommander(activeDeck).commanderName) : true);

  useEffect(() => {
    const isCmdr = activeDeck?.format === 'commander';
    const hasCommander = isCmdr ? Boolean(getDeckCommander(activeDeck).commanderName) : true;

    if (isActive && !prevIsActive.current) {
      // Just became active
      if (isCmdr && searchContext === 'deck') {
        if (!hasCommander) {
          const newTerm = 'is:commander ';
          setSearchTerm(newTerm);
          executeSearch(1, false, newTerm);
        }
      }
    } else if (isActive && prevIsActive.current) {
      // Was already active, check if commander state changed
      if (isCmdr && searchContext === 'deck' && !prevHasCommander.current && hasCommander) {
        setSearchTerm(prev => prev.replace(/is:commander\s*/i, '').trim());
        // We probably don't want to auto-search on clear to avoid jarring UX, but you could
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
    }, 750);

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
    scopeBySearchTerm,
    sortBy,
    sortDir,
    activeDeck?.id,
    activeDeck?.format,
    activeDeck?.commanderName,
    activeDeck?.commanderId,
    activeDeck?.commanderColorIdentity?.join(''),
  ]);

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
    }, 450);

    return () => {
      if (autocompleteDebounceRef.current) clearTimeout(autocompleteDebounceRef.current);
    };
  }, [searchTerm]);

  const isColorDisabledByCommander = (colorKey: string) => {
    if (!isCommanderDeck || !hasCommander) return false;
    if (colorKey === 'C') return false;
    return !commanderColorIdentity.includes(colorKey);
  };

  const toggleColor = (c: string) => {
    if (isColorDisabledByCommander(c)) return;
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
    <div className="space-y-5">
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
              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 font-mono">
                {activeDeck.cards
                  .filter((c) => c.category === 'main' || c.category === 'commander')
                  .reduce((s, c) => s + c.quantity, 0)}
                {activeDeck.format === 'commander' ? '/100' : ''} cards
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
                        setSearchTerm('is:commander ');
                        setSelectedTypes(['creature']);
                        // Trigger search in next tick so selectedTypes is captured
                        setTimeout(() => executeSearch(1, false, 'is:commander '), 50);
                      }}
                      className="px-2 py-0.5 rounded bg-fuchsia-500 text-slate-950 text-[10px] font-bold hover:bg-fuchsia-400 transition-colors"
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
              placeholder='Search 30,000+ Magic cards by name or syntax (e.g. "Rhystic Study", "Lightning Bolt")...'
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-fuchsia-500 animate-spin shrink-0" />}
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 shrink-0"
              >
                Clear
              </button>
            )}
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
                    onClick={() => !disabled && toggleColor(c.id)}
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

            {/* Live Scryfall Query Preview */}
            {currentCompiledQuery && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono">
                <div className="truncate text-slate-400">
                  <span className="text-slate-500 font-sans mr-1">Scryfall Query:</span>
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
            <span>{showSyntaxHelp ? 'Hide Scryfall Syntax Guide' : 'Scryfall Syntax Guide'}</span>
          </button>
        </div>

        {/* Scryfall Syntax Helper Card */}
        {showSyntaxHelp && (
          <div className="p-3 bg-slate-950 rounded-xl border border-fuchsia-900/40 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-fuchsia-300">Scryfall Advanced Syntax Tips:</p>
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
              ? 'Searching Scryfall...'
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
            <span className="text-slate-400">
              · Adding to: <strong className="text-fuchsia-300">{activeDeck.name}</strong> ({activeDeck.format})
            </span>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {displayedCards.map((card) => {
            const price = card.prices?.usd ? `$${parseFloat(card.prices.usd).toFixed(2)}` : '—';
            const foilPrice = card.prices?.usd_foil ? `$${parseFloat(card.prices.usd_foil).toFixed(2)}` : null;
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
                  onClick={() => onSelectCard(card)}
                  className="cursor-pointer relative overflow-hidden aspect-[5/7] bg-slate-950"
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
                    onError={(e) => {
                      if (card.id && !e.currentTarget.src.includes('format=image')) {
                        e.currentTarget.src = `https://api.scryfall.com/cards/${card.id}?format=image&version=normal`;
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 text-fuchsia-300 text-xs font-semibold shadow-lg backdrop-blur-xs">
                      Inspect Card
                    </span>
                  </div>

                  {/* Quantity In Deck Overlay Badge */}
                  {isDeckContext && activeDeck && (
                    <div
                      className={`absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-md flex items-center gap-1 ${
                        isAtLimit
                          ? 'bg-fuchsia-500 text-slate-950 border border-fuchsia-400 font-extrabold'
                          : deckCopies > 0
                            ? 'bg-slate-900/95 text-fuchsia-300 border border-fuchsia-500/50 backdrop-blur-xs'
                            : 'bg-slate-950/85 text-slate-400 border border-slate-800'
                      }`}
                      title={`${deckCopies} in deck (Format limit: ${deckLimit < 999 ? deckLimit : 'No limit'})`}
                    >
                      <Layers className="w-2.5 h-2.5" />
                      <span>
                        {deckCopies > 0
                          ? `${deckCopies}${deckLimit < 999 ? `/${deckLimit}` : ''} in deck`
                          : '0 in deck'}
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
                </div>

                {/* Card Info & Quick Actions */}
                <div className="p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <h4 
                      onClick={() => onSelectCard(card)}
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
                    <div className="flex items-center text-[10px] text-slate-500 mt-0.5 truncate" title={card.set_name}>
                      <span className="uppercase font-bold mr-1.5 text-slate-400">{card.set}</span>
                      <span className="truncate">{card.set_name}</span>
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
                        isCommanderDeck && !hasCommander && /Legendary/i.test(card.type_line) && (/Creature/i.test(card.type_line) || /Planeswalker/i.test(card.type_line) || (card.oracle_text && card.oracle_text.includes('can be your commander'))) ? (
                          <button
                            onClick={() => onQuickAddToDeck(card, 'commander')}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/50 hover:bg-fuchsia-500 hover:text-slate-950 text-fuchsia-300 text-xs font-bold transition-all cursor-pointer shadow-sm"
                            title="Set this card as your Commander"
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span>Set as Commander</span>
                          </button>
                        ) : (
                          (() => {
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

                            if (isAtLimit) {
                              return (
                                <button
                                  disabled
                                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-900/90 border border-fuchsia-800/40 text-fuchsia-500/60 text-xs font-semibold cursor-not-allowed"
                                  title={`Format limit reached (${deckLimit} copies allowed)`}
                                >
                                  <Check className="w-3.5 h-3.5 text-fuchsia-500/70" />
                                  <span>At Limit ({deckCopies}/{deckLimit})</span>
                                </button>
                              );
                            }

                            return (
                              <button
                                onClick={() => onQuickAddToDeck(card, 'main')}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-fuchsia-500 hover:text-slate-950 text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-sm"
                                title="Add 1 copy to current deck"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add to Deck</span>
                                {deckCopies > 0 && (
                                  <span className="text-[10px] font-mono font-semibold opacity-80">({deckCopies})</span>
                                )}
                              </button>
                            );
                          })()
                        )
                      ) : (
                        <div className="text-[11px] text-slate-500 text-center py-1">No deck selected</div>
                      )
                    ) : (
                      // Binder context: ONLY Binder button shown!
                      onQuickAddToCollection && (
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
                : 'Ready to search Scryfall'}
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

      {/* Sticky Floating Return to Deck Button */}
      {activeDeck && onReturnToDeck && (
        <div className="fixed bottom-6 left-6 z-30">
          <button
            onClick={onReturnToDeck}
            className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-fuchsia-400 hover:from-fuchsia-400 hover:to-fuchsia-300 text-slate-950 text-xs font-bold shadow-2xl hover:shadow-fuchsia-500/25 transition-all hover:scale-105 cursor-pointer border border-fuchsia-300/40"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to {activeDeck.name}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-950/20 text-[10px] font-mono">
              {activeDeck.cards.filter((c) => c.category === 'main' || c.category === 'commander').reduce((s, c) => s + c.quantity, 0)}
              {activeDeck.format === 'commander' ? '/100' : ''} cards
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
