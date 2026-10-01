import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Search, 
  Plus, 
  Check, 
  Layers, 
  HelpCircle, 
  Loader2 
} from 'lucide-react';
import { Deck, DeckCategory, ScryfallCard } from '../types/mtg';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { getDeckCommander } from '../utils/deckUtils';
import { searchCards, getCardImageUrl } from '../services/api';
import { useImageHoverPreview, ImageHoverPopup } from './ImageHoverPopup';

interface RecommendationItem {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line: string;
  priceUsd?: number;
  imageUrl: string;
  categoryTag: 'ramp' | 'draw' | 'removal' | 'staple' | 'land';
}

const BASE_STAPLES: { name: string; tag: RecommendationItem['categoryTag']; cost: string; type: string }[] = [
  // Colorless / Universal
  { name: 'Sol Ring', tag: 'ramp', cost: '{1}', type: 'Artifact' },
  { name: 'Arcane Signet', tag: 'ramp', cost: '{2}', type: 'Artifact' },
  { name: 'Command Tower', tag: 'land', cost: '', type: 'Land' },
  { name: 'Swiftfoot Boots', tag: 'staple', cost: '{2}', type: 'Artifact — Equipment' },
  { name: 'Lightning Greaves', tag: 'staple', cost: '{2}', type: 'Artifact — Equipment' },
  { name: 'Thought Vessel', tag: 'ramp', cost: '{2}', type: 'Artifact' },
  { name: 'Mind Stone', tag: 'ramp', cost: '{2}', type: 'Artifact' },
  { name: 'Fellwar Stone', tag: 'ramp', cost: '{2}', type: 'Artifact' },
  // White
  { name: 'Swords to Plowshares', tag: 'removal', cost: '{W}', type: 'Instant' },
  { name: 'Path to Exile', tag: 'removal', cost: '{W}', type: 'Instant' },
  { name: 'Esper Sentinel', tag: 'draw', cost: '{W}', type: 'Creature' },
  { name: "Teferi's Protection", tag: 'staple', cost: '{2}{W}', type: 'Instant' },
  { name: 'Smothering Tithe', tag: 'ramp', cost: '{3}{W}', type: 'Enchantment' },
  { name: 'Generous Gift', tag: 'removal', cost: '{2}{W}', type: 'Instant' },
  { name: 'Stroke of Midnight', tag: 'removal', cost: '{2}{W}', type: 'Instant' },
  // Blue
  { name: 'Counterspell', tag: 'removal', cost: '{U}{U}', type: 'Instant' },
  { name: 'Rhystic Study', tag: 'draw', cost: '{2}{U}', type: 'Enchantment' },
  { name: 'Cyclonic Rift', tag: 'removal', cost: '{1}{U}', type: 'Instant' },
  { name: 'Brainstorm', tag: 'draw', cost: '{U}', type: 'Instant' },
  { name: 'Ponder', tag: 'draw', cost: '{U}', type: 'Sorcery' },
  { name: 'Preordain', tag: 'draw', cost: '{U}', type: 'Sorcery' },
  { name: 'Swan Song', tag: 'removal', cost: '{U}', type: 'Instant' },
  { name: 'Fierce Guardianship', tag: 'removal', cost: '{2}{U}', type: 'Instant' },
  // Black
  { name: 'Demonic Tutor', tag: 'staple', cost: '{1}{B}', type: 'Sorcery' },
  { name: 'Vampiric Tutor', tag: 'staple', cost: '{B}', type: 'Instant' },
  { name: 'Toxic Deluge', tag: 'removal', cost: '{2}{B}', type: 'Sorcery' },
  { name: 'Dark Ritual', tag: 'ramp', cost: '{B}', type: 'Instant' },
  { name: 'Feed the Swarm', tag: 'removal', cost: '{1}{B}', type: 'Sorcery' },
  { name: 'Night\'s Whisper', tag: 'draw', cost: '{1}{B}', type: 'Sorcery' },
  { name: 'Sign in Blood', tag: 'draw', cost: '{B}{B}', type: 'Sorcery' },
  // Red
  { name: 'Blasphemous Act', tag: 'removal', cost: '{8}{R}', type: 'Sorcery' },
  { name: 'Chaos Warp', tag: 'removal', cost: '{2}{R}', type: 'Instant' },
  { name: "Jeska's Will", tag: 'ramp', cost: '{2}{R}', type: 'Sorcery' },
  { name: 'Deflecting Swat', tag: 'removal', cost: '{2}{R}', type: 'Instant' },
  { name: 'Vandalblast', tag: 'removal', cost: '{R}', type: 'Sorcery' },
  { name: 'Faithless Looting', tag: 'draw', cost: '{R}', type: 'Sorcery' },
  // Green
  { name: 'Cultivate', tag: 'ramp', cost: '{2}{G}', type: 'Sorcery' },
  { name: "Kodama's Reach", tag: 'ramp', cost: '{2}{G}', type: 'Sorcery' },
  { name: 'Rampant Growth', tag: 'ramp', cost: '{1}{G}', type: 'Sorcery' },
  { name: 'Heroic Intervention', tag: 'staple', cost: '{1}{G}', type: 'Instant' },
  { name: 'Beast Within', tag: 'removal', cost: '{2}{G}', type: 'Instant' },
  { name: 'Farseek', tag: 'ramp', cost: '{1}{G}', type: 'Sorcery' },
  { name: 'Nature\'s Lore', tag: 'ramp', cost: '{1}{G}', type: 'Sorcery' },
  { name: 'Three Visits', tag: 'ramp', cost: '{1}{G}', type: 'Sorcery' },
];

function getSafeImageUrl(cardName: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=normal`;
}

interface CommanderRecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
  onAddCard: (cardName: string, category: DeckCategory) => void;
}

export const CommanderRecommendationsModal: React.FC<CommanderRecommendationsModalProps> = ({
  isOpen,
  onClose,
  deck,
  onAddCard,
}) => {
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [addedMap, setAddedMap] = useState<Record<string, string>>({});
  const [apiRecommendations, setApiRecommendations] = useState<RecommendationItem[]>([]);
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  const cmdr = useMemo(() => getDeckCommander(deck), [deck]);
  const cmdrColors = cmdr?.colorIdentity || ['W', 'U', 'B', 'R', 'G'];

  const deckCardNames = useMemo(() => {
    return new Set(deck.cards.map((c) => c.name.toLowerCase().split(' // ')[0].trim()));
  }, [deck.cards]);

  // Load EDHREC recommendations from Scryfall API on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchTopEdhrecCards = async () => {
      try {
        setIsLoadingApi(true);
        const ciStr = cmdrColors.length > 0 ? cmdrColors.join('') : 'c';
        const query = `f:commander id<=${ciStr} -t:basic`;
        const res = await searchCards({ query, order: 'edhrec', page: 1 });

        if (isMounted && res && Array.isArray(res.data)) {
          const items: RecommendationItem[] = res.data.slice(0, 40).map((card: ScryfallCard) => {
            const type = (card.type_line || '').toLowerCase();
            const oracle = (card.oracle_text || '').toLowerCase();
            let tag: RecommendationItem['categoryTag'] = 'staple';

            if (type.includes('land')) tag = 'land';
            else if (oracle.includes('add ') || oracle.includes('search your library for a') || type.includes('mana')) tag = 'ramp';
            else if (oracle.includes('draw') || oracle.includes('look at the top')) tag = 'draw';
            else if (oracle.includes('destroy') || oracle.includes('exile') || oracle.includes('counter target') || oracle.includes('damage to each')) tag = 'removal';

            const img = getCardImageUrl(card, 'normal');

            return {
              id: card.id,
              name: card.name,
              mana_cost: card.mana_cost,
              cmc: card.cmc,
              type_line: card.type_line,
              priceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined,
              imageUrl: img,
              categoryTag: tag,
            };
          });
          setApiRecommendations(items);
        }
      } catch (err) {
        console.error('Error fetching EDHREC recommendations:', err);
      } finally {
        if (isMounted) setIsLoadingApi(false);
      }
    };

    fetchTopEdhrecCards();

    return () => {
      isMounted = false;
    };
  }, [isOpen, cmdrColors.join('')]);

  if (!isOpen) return null;

  // Filter curated base staples by commander colors
  const curatedItems: RecommendationItem[] = BASE_STAPLES.filter((item) => {
    const cost = item.cost;
    if (cost.includes('{W}') && !cmdrColors.includes('W')) return false;
    if (cost.includes('{U}') && !cmdrColors.includes('U')) return false;
    if (cost.includes('{B}') && !cmdrColors.includes('B')) return false;
    if (cost.includes('{R}') && !cmdrColors.includes('R')) return false;
    if (cost.includes('{G}') && !cmdrColors.includes('G')) return false;
    return true;
  }).map((item) => ({
    id: `curated-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    name: item.name,
    mana_cost: item.cost,
    type_line: item.type,
    imageUrl: getSafeImageUrl(item.name),
    categoryTag: item.tag,
  }));

  // Merge API recommendations with curated items (avoiding duplicates)
  const combinedMap = new Map<string, RecommendationItem>();
  curatedItems.forEach((c) => combinedMap.set(c.name.toLowerCase().trim(), c));
  apiRecommendations.forEach((a) => {
    const key = a.name.toLowerCase().trim();
    if (!combinedMap.has(key)) {
      combinedMap.set(key, a);
    } else {
      // Prefer API image and pricing if available
      const existing = combinedMap.get(key)!;
      combinedMap.set(key, { ...existing, imageUrl: a.imageUrl, priceUsd: a.priceUsd, type_line: a.type_line, mana_cost: a.mana_cost });
    }
  });

  const allRecommendations = Array.from(combinedMap.values());

  const filteredRecommendations = allRecommendations.filter((card) => {
    if (selectedTag !== 'all' && card.categoryTag !== selectedTag) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      return card.name.toLowerCase().includes(q) || card.type_line.toLowerCase().includes(q);
    }
    return true;
  });

  const handleAdd = (cardName: string, category: DeckCategory) => {
    onAddCard(cardName, category);
    setAddedMap((prev) => ({ ...prev, [cardName]: category }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Commander Synergy &amp; Staples Engine</span>
                {cmdr?.commanderName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 font-semibold">
                    {cmdr.commanderName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Top format staples and synergistic cards curated for your commander's color identity ({cmdrColors.join('') || 'C'})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search & Category Filter */}
        <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search staples & recommendations..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {['all', 'ramp', 'draw', 'removal', 'staple', 'land'].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`px-2.5 py-1 rounded-lg capitalize font-semibold transition-colors cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Recommendation Cards Grid */}
        <div className="p-5 overflow-y-auto flex-1">
          {isLoadingApi && allRecommendations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-xs">Fetching Commander staples &amp; recommendations...</span>
            </div>
          ) : filteredRecommendations.length === 0 ? (
            <div className="text-center py-16 text-xs text-slate-500">
              No recommendations found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredRecommendations.map((card) => {
                const inDeck = deckCardNames.has(card.name.toLowerCase().trim());
                const addedAs = addedMap[card.name];

                return (
                  <div
                    key={card.id}
                    className="flex items-center gap-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl hover:border-slate-700 transition-all shadow-sm"
                  >
                    <div className="w-14 h-20 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 shrink-0 shadow-sm">
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = 'https://cards.scryfall.io/back.jpg';
                        }}
                      />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-between h-full py-0.5">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-200 truncate" title={card.name}>
                            {card.name}
                          </span>
                          {card.priceUsd !== undefined && card.priceUsd > 0 && (
                            <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                              ${card.priceUsd.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {card.type_line}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-900">
                        {inDeck ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                            <Check className="w-3.5 h-3.5" />
                            <span>In Deck</span>
                          </span>
                        ) : addedAs ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-violet-300 font-semibold">
                            <Check className="w-3.5 h-3.5" />
                            <span>Added to {addedAs}!</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <button
                              type="button"
                              onClick={() => handleAdd(card.name, 'main')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                              title="Add to Mainboard"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Main</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdd(card.name, 'maybeboard')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-violet-600 text-slate-300 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                              title="Add to Maybeboard"
                            >
                              <HelpCircle className="w-3 h-3" />
                              <span>Maybe</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Showing {filteredRecommendations.length} recommendations matching {cmdrColors.join('') || 'C'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
