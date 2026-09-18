/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Deck, 
  CollectionCard, 
  ScryfallCard, 
  DeckCategory, 
  CardCondition, 
  DeckCard,
  Binder
} from './types/mtg';
import { StorageService, SyncStatus } from './services/storage';
import { Navbar } from './components/Navbar';
import { DeckList } from './components/DeckList';
import { DeckBuilder } from './components/DeckBuilder';
import { CollectionManager } from './components/CollectionManager';
import { CardSearchView } from './components/CardSearchView';
import { CardDetailModal } from './components/CardDetailModal';
import { SyncModal } from './components/SyncModal';
import { ApiDiagnosticsModal } from './components/ApiDiagnosticsModal';
import { BinderList } from './components/BinderList';
import { getCardImageUrl } from './services/scryfall';
import { getDeckCommander, isCardLegalInCommander } from './utils/deckUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'decks' | 'collection' | 'search'>('decks');
  const [searchContext, setSearchContext] = useState<'deck' | 'binder'>('deck');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [collectionCards, setCollectionCards] = useState<CollectionCard[]>([]);
  const [binders, setBinders] = useState<Binder[]>([]);
  const [activeBinder, setActiveBinder] = useState<Binder | null>(null);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  
  // Modals
  const [inspectedCard, setInspectedCard] = useState<ScryfallCard | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [globalToast, setGlobalToast] = useState<{
    message: string;
    type: 'success' | 'info';
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  const showToast = (
    message: string,
    type: 'success' | 'info' = 'success',
    actionLabel?: string,
    onAction?: () => void
  ) => {
    setGlobalToast({ message, type, actionLabel, onAction });
    setTimeout(() => {
      setGlobalToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  // Subscribe to Turso Database & local cache
  useEffect(() => {
    const unsubDecks = StorageService.subscribeDecks((updatedDecks) => {
      setDecks(updatedDecks);
      setActiveDeck(prev => {
        if (!prev) return null;
        return updatedDecks.find(d => d.id === prev.id) || prev;
      });
    });

    const unsubCol = StorageService.subscribeCollection((updatedCol) => {
      setCollectionCards(updatedCol);
    });

    const unsubBinders = StorageService.subscribeBinders((updatedBinders) => {
      setBinders(updatedBinders);
      setActiveBinder(prev => {
        if (!prev) return null;
        return updatedBinders.find(b => b.id === prev.id) || prev;
      });
    });

    const unsubSync = StorageService.onSyncStatusChange((status) => {
      setSyncStatus(status);
    });

    return () => {
      unsubDecks();
      unsubCol();
      unsubBinders();
      unsubSync();
    };
  }, [activeDeck?.id, activeBinder?.id]);

  // Deck operations
  const handleCreateDeck = async (newDeckData: Partial<Deck>) => {
    const newDeck: Deck = {
      id: `deck-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: newDeckData.name || 'New Custom Deck',
      description: newDeckData.description || '',
      format: newDeckData.format || 'commander',
      cards: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await StorageService.saveDeck(newDeck);
    setActiveDeck(newDeck);
    setActiveTab('decks');
    showToast(`Created deck "${newDeck.name}"`);
  };

  const handleUpdateDeck = async (updatedDeck: Deck) => {
    await StorageService.saveDeck(updatedDeck);
    setActiveDeck(updatedDeck);
  };

  const handleImportAsNewDeck = async (newDeck: Deck, shouldSaveCurrentDeck: boolean) => {
    if (shouldSaveCurrentDeck && activeDeck) {
      await StorageService.saveDeck({ ...activeDeck, updatedAt: Date.now() });
    }
    await StorageService.saveDeck(newDeck);
    setActiveDeck(newDeck);
    setActiveTab('decks');
    showToast(`Imported deck "${newDeck.name}" (${newDeck.cards.reduce((s, c) => s + c.quantity, 0)} cards)!`, 'success');
  };

  const handleCreateNewDeckFromExisting = async (currentDeckToSave: Deck) => {
    // 1. Save the existing deck with its latest modifications
    await StorageService.saveDeck({ ...currentDeckToSave, updatedAt: Date.now() });

    // 2. Determine format label for sensible new deck naming
    const formatLabel = currentDeckToSave.format === 'commander'
      ? 'Commander'
      : currentDeckToSave.format.charAt(0).toUpperCase() + currentDeckToSave.format.slice(1);

    // 3. Create the new deck matching current format preference
    const newDeck: Deck = {
      id: `deck-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: `New ${formatLabel} Deck`,
      description: '',
      format: currentDeckToSave.format || 'commander',
      cards: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 4. Save and activate the new deck
    await StorageService.saveDeck(newDeck);
    setActiveDeck(newDeck);
    setActiveTab('decks');

    // 5. Toast with 1-click return button if user wants to switch back
    showToast(
      `Saved "${currentDeckToSave.name}" and created "${newDeck.name}"`,
      'success',
      `Back to ${currentDeckToSave.name} →`,
      () => setActiveDeck(currentDeckToSave)
    );
  };

  const handleDeleteDeck = async (deckId: string) => {
    await StorageService.deleteDeck(deckId);
    if (activeDeck?.id === deckId) {
      setActiveDeck(null);
    }
    showToast('Deck deleted');
  };

  const handleDuplicateDeck = async (sourceDeck: Deck) => {
    const duplicated: Deck = {
      ...sourceDeck,
      id: `deck-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: `${sourceDeck.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cards: sourceDeck.cards.map((c) => ({
        ...c,
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      })),
    };

    await StorageService.saveDeck(duplicated);
    showToast(`Duplicated "${sourceDeck.name}"`);
  };

  // Add card to active deck
  const handleAddCardToDeck = async (
    card: ScryfallCard,
    category: DeckCategory = 'main',
    quantity: number = 1,
    isFoil: boolean = false
  ) => {
    if (!activeDeck) {
      showToast('Please create or select a deck first!', 'info');
      setActiveTab('decks');
      return;
    }

    // Get latest state to prevent race conditions
    const latestActiveDeck = StorageService.getLocalDecks().find(d => d.id === activeDeck.id) || activeDeck;

    // Check Commander rules
    if (latestActiveDeck.format === 'commander') {
      const commanderInfo = getDeckCommander(latestActiveDeck);

      // If adding as regular card (not designating commander), check color identity against existing commander
      if (category !== 'commander' && commanderInfo.hasCommander) {
        const legality = isCardLegalInCommander(card, commanderInfo.colorIdentity);
        if (!legality.isLegal) {
          showToast(
            `Illegal Card: "${card.name}" color identity does not fit Commander ${commanderInfo.commanderName || 'commander'} (${commanderInfo.colorIdentity.join('') || 'C'})`,
            'info'
          );
          return;
        }
      }

      // Check singleton rule for commander decks (max 1 copy of non-basic lands)
      const isBasic = /Basic Land/i.test(card.type_line);
      if (!isBasic) {
        const cleanName = card.name.split(' // ')[0].trim().toLowerCase();
        const alreadyInDeck = latestActiveDeck.cards.some(
          (c) => c.name.split(' // ')[0].trim().toLowerCase() === cleanName
        );
        if (alreadyInDeck) {
          showToast(`"${card.name}" is already in your Commander deck (1 copy limit).`, 'info');
          return;
        }
      }
    }

    const currentCards = [...latestActiveDeck.cards];
    const existingIdx = currentCards.findIndex(
      (c) => c.scryfallId === card.id && c.category === category && Boolean(c.isFoil) === isFoil
    );

    let updatedCover = latestActiveDeck.coverCardUrl;
    let updatedCommanderName = latestActiveDeck.commanderName;
    let updatedCommanderArt = latestActiveDeck.commanderArtUrl;
    let updatedCommanderId = latestActiveDeck.commanderId;
    let updatedCommanderColorIdentity = latestActiveDeck.commanderColorIdentity;

    const imgUrl = getCardImageUrl(card, 'normal');

    if (category === 'commander') {
      updatedCommanderName = card.name;
      updatedCommanderArt = getCardImageUrl(card, 'art_crop');
      updatedCover = updatedCommanderArt;
      updatedCommanderId = card.id;
      updatedCommanderColorIdentity = card.color_identity || [];
    } else if (!updatedCover) {
      updatedCover = getCardImageUrl(card, 'art_crop');
    }

    if (existingIdx >= 0) {
      currentCards[existingIdx] = {
        ...currentCards[existingIdx],
        quantity: currentCards[existingIdx].quantity + quantity
      };
    } else {
      const newDeckCard: DeckCard = {
        id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: card.id,
        name: card.name,
        set: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        category,
        quantity,
        isFoil,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        color_identity: card.color_identity,
        rarity: card.rarity,
        imageUrl: imgUrl,
        priceUsd: card.prices.usd ? parseFloat(card.prices.usd) : undefined,
        priceUsdFoil: card.prices.usd_foil ? parseFloat(card.prices.usd_foil) : undefined,
      };
      currentCards.push(newDeckCard);
    }

    const updatedDeck: Deck = {
      ...latestActiveDeck,
      cards: currentCards,
      coverCardUrl: updatedCover,
      commanderName: updatedCommanderName,
      commanderArtUrl: updatedCommanderArt,
      commanderId: updatedCommanderId,
      commanderColorIdentity: updatedCommanderColorIdentity,
      updatedAt: Date.now(),
    };

    await StorageService.saveDeck(updatedDeck);
    setActiveDeck(updatedDeck);
    showToast(
      `Added ${quantity}x "${card.name}" to ${latestActiveDeck.name}`,
      'success',
      'Return to Deck →',
      () => setActiveTab('decks')
    );
  };

  // Add collection card to active deck
  const handleAddCollectionItemToDeck = async (item: CollectionCard) => {
    if (!activeDeck) {
      showToast('Select a deck first to add cards from your binder.', 'info');
      setActiveTab('decks');
      return;
    }

    // Get latest state
    const latestActiveDeck = StorageService.getLocalDecks().find(d => d.id === activeDeck.id) || activeDeck;

    // Check Commander rules for collection additions
    if (latestActiveDeck.format === 'commander') {
      const commanderInfo = getDeckCommander(latestActiveDeck);
      if (commanderInfo.hasCommander) {
        const legality = isCardLegalInCommander(
          {
            name: item.name,
            color_identity: item.color_identity,
            colors: item.colors,
            type_line: item.type_line,
          },
          commanderInfo.colorIdentity
        );
        if (!legality.isLegal) {
          showToast(
            `Illegal Card: "${item.name}" color identity does not fit Commander (${commanderInfo.colorIdentity.join('') || 'C'})`,
            'info'
          );
          return;
        }
      }

      const isBasic = /Basic Land/i.test(item.type_line);
      if (!isBasic) {
        const cleanName = item.name.split(' // ')[0].trim().toLowerCase();
        const alreadyInDeck = latestActiveDeck.cards.some(
          (c) => c.name.split(' // ')[0].trim().toLowerCase() === cleanName
        );
        if (alreadyInDeck) {
          showToast(`"${item.name}" is already in your Commander deck (1 copy limit).`, 'info');
          return;
        }
      }
    }

    const currentCards = [...latestActiveDeck.cards];
    const existingIdx = currentCards.findIndex(
      (c) => c.scryfallId === item.scryfallId && c.category === 'main'
    );

    if (existingIdx >= 0) {
      currentCards[existingIdx] = {
        ...currentCards[existingIdx],
        quantity: currentCards[existingIdx].quantity + 1
      };
    } else {
      const newCard: DeckCard = {
        id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: item.scryfallId,
        name: item.name,
        set: item.set,
        set_name: item.setName,
        collector_number: item.collectorNumber,
        category: 'main',
        quantity: 1,
        isFoil: item.isFoil,
        mana_cost: item.mana_cost,
        cmc: item.cmc,
        type_line: item.type_line,
        colors: item.colors,
        color_identity: item.color_identity,
        rarity: item.rarity,
        imageUrl: item.imageUrl,
        priceUsd: item.currentPriceUsd,
      };
      currentCards.push(newCard);
    }

    const updatedDeck: Deck = {
      ...latestActiveDeck,
      cards: currentCards,
      updatedAt: Date.now(),
    };

    await StorageService.saveDeck(updatedDeck);
    setActiveDeck(updatedDeck);
    showToast(
      `Added "${item.name}" from binder into ${latestActiveDeck.name}`,
      'success',
      'Return to Deck →',
      () => setActiveTab('decks')
    );
  };

  // Add card to collection binder
  const handleAddCardToCollection = async (
    card: ScryfallCard,
    quantity: number = 1,
    isFoil: boolean = false,
    condition: CardCondition = 'NM',
    acquiredPrice?: number
  ) => {
    let targetBinder = activeBinder;

    // Auto-create a binder with a generic name if none exists
    if (!targetBinder) {
      if (binders.length > 0) {
        targetBinder = binders[0];
      } else {
        targetBinder = await StorageService.createBinder('Main Binder', 'Default collection binder');
        setActiveBinder(targetBinder);
      }
    }

    const targetBinderId = targetBinder.id;
    
    // Get latest collection directly to prevent race conditions from double-clicks
    const latestCollection = StorageService.getLocalCollection();
    const existing = latestCollection.find(
      (c) =>
        c.scryfallId === card.id &&
        c.isFoil === isFoil &&
        c.condition === condition &&
        ((c.binderId || 'binder-main') === targetBinderId)
    );

    const priceUsd = isFoil && card.prices.usd_foil
      ? parseFloat(card.prices.usd_foil)
      : (card.prices.usd ? parseFloat(card.prices.usd) : 0);

    if (existing) {
      const updated: CollectionCard = {
        ...existing,
        quantity: existing.quantity + quantity,
      };
      await StorageService.saveCollectionCard(updated);
    } else {
      const newColCard: CollectionCard = {
        id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: card.id,
        binderId: targetBinderId,
        name: card.name,
        set: card.set,
        setName: card.set_name,
        collectorNumber: card.collector_number,
        quantity,
        isFoil,
        condition,
        cmc: card.cmc,
        mana_cost: card.mana_cost,
        type_line: card.type_line,
        colors: card.colors,
        color_identity: card.color_identity,
        rarity: card.rarity,
        imageUrl: getCardImageUrl(card, 'normal'),
        acquiredPrice: acquiredPrice !== undefined ? acquiredPrice : priceUsd,
        currentPriceUsd: priceUsd,
        addedAt: Date.now(),
      };
      await StorageService.saveCollectionCard(newColCard);
    }

    showToast(
      `Added ${quantity}x "${card.name}" to ${targetBinder.name}!`,
      'success',
      'View Binder →',
      () => {
        setActiveBinder(targetBinder);
        setActiveTab('collection');
      }
    );
  };

  const handleCreateBinder = async (name: string, description?: string) => {
    const newBinder = await StorageService.createBinder(name, description);
    setActiveBinder(newBinder);
    showToast(`Created binder "${name}"`);
  };

  const handleDeleteBinder = async (binderId: string) => {
    await StorageService.deleteBinder(binderId);
    if (activeBinder?.id === binderId) {
      setActiveBinder(null);
    }
    showToast('Binder deleted');
  };

  const handleUpdateCollectionCard = async (card: CollectionCard) => {
    await StorageService.saveCollectionCard(card);
  };

  const handleDeleteCollectionCard = async (cardId: string) => {
    await StorageService.deleteCollectionCard(cardId);
    showToast('Removed from binder');
  };

  // Top-level tab change handler:
  const handleTabChange = async (tab: 'decks' | 'collection' | 'search') => {
    if (tab === 'decks') {
      if (activeDeck) {
        await StorageService.saveDeck({ ...activeDeck, updatedAt: Date.now() });
        setActiveDeck(null);
      }
      setActiveTab('decks');
    } else if (tab === 'collection') {
      if (activeBinder) {
        await StorageService.saveBinder({ ...activeBinder, updatedAt: Date.now() });
        setActiveBinder(null);
      }
      setActiveTab('collection');
    } else {
      setActiveTab(tab);
    }
  };

  const handleVaultChanged = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 text-slate-100 font-sans flex flex-col selection:bg-fuchsia-500 selection:text-slate-950">
      {/* Navigation */}
      <Navbar
        binders={binders}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        decks={decks}
        collection={collectionCards}
        activeDeck={activeDeck}
        onSelectActiveDeck={(deck) => {
          setActiveDeck(deck);
          setActiveTab('decks');
        }}
        syncStatus={syncStatus}
        onOpenSyncModal={() => setShowSyncModal(true)}
        onOpenDiagnostics={() => setShowDiagnosticsModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Decks Tab */}
        {activeTab === 'decks' && (
          activeDeck ? (
            <DeckBuilder
              deck={activeDeck}
              onBack={async () => {
                if (activeDeck) {
                  await StorageService.saveDeck({ ...activeDeck, updatedAt: Date.now() });
                }
                setActiveDeck(null);
              }}
              onUpdateDeck={handleUpdateDeck}
              onDeleteDeck={handleDeleteDeck}
              onOpenSearch={() => {
                setSearchContext('deck');
                setActiveTab('search');
              }}
              onSelectCard={(c) => setInspectedCard(c)}
              onCreateNewDeck={handleCreateNewDeckFromExisting}
              onImportAsNewDeck={handleImportAsNewDeck}
            />
          ) : (
            <DeckList
              decks={decks}
              onSelectDeck={(d) => setActiveDeck(d)}
              onCreateDeck={handleCreateDeck}
              onDuplicateDeck={handleDuplicateDeck}
              onDeleteDeck={handleDeleteDeck}
              onImportDeck={handleImportAsNewDeck}
            />
          )
        )}

        {/* Collection Tab */}
        {activeTab === 'collection' && (
          activeBinder ? (
            <CollectionManager
              collection={collectionCards}
              binders={binders}
              activeBinder={activeBinder}
              onSelectBinder={(b) => setActiveBinder(b)}
              onCreateBinder={handleCreateBinder}
              onDeleteBinder={handleDeleteBinder}
              activeDeck={activeDeck}
              onUpdateCollectionCard={handleUpdateCollectionCard}
              onDeleteCollectionCard={handleDeleteCollectionCard}
              onAddCardToDeck={handleAddCollectionItemToDeck}
              onOpenSearch={() => {
                setSearchContext('binder');
                setActiveTab('search');
              }}
              onSelectCard={(c) => setInspectedCard(c)}
              onBackToDashboard={async () => {
                if (activeBinder) {
                  await StorageService.saveBinder({ ...activeBinder, updatedAt: Date.now() });
                }
                setActiveBinder(null);
              }}
            />
          ) : (
            <BinderList 
              binders={binders}
              onSelectBinder={(b) => setActiveBinder(b)}
              onCreateBinder={handleCreateBinder}
              onDeleteBinder={handleDeleteBinder}
            />
          )
        )}

        {/* Scryfall Card Search Database Tab */}
        <div className={activeTab === 'search' ? 'block' : 'hidden'}>
          <CardSearchView
            isActive={activeTab === 'search'}
            searchContext={searchContext}
            onSetSearchContext={(ctx) => setSearchContext(ctx)}
            activeDeck={activeDeck}
            activeBinder={activeBinder}
            binders={binders}
            onSelectBinder={(b) => setActiveBinder(b)}
            onCreateBinder={handleCreateBinder}
            onSelectCard={(c) => setInspectedCard(c)}
            onQuickAddToDeck={(card, category) => handleAddCardToDeck(card, category, 1, false)}
            onQuickAddToCollection={(card, isFoil) => handleAddCardToCollection(card, 1, isFoil || false, 'NM')}
            onReturnToDeck={() => setActiveTab('decks')}
            onReturnToBinder={() => setActiveTab('collection')}
          />
        </div>
      </main>

      {/* Card Detail Modal */}
      <CardDetailModal
        card={inspectedCard}
        isOpen={Boolean(inspectedCard)}
        onClose={() => setInspectedCard(null)}
        searchContext={searchContext}
        activeDeck={activeDeck}
        binders={binders}
        activeBinder={activeBinder}
        onSelectBinder={(b) => setActiveBinder(b)}
        onAddCardToDeck={(card, category, qty, foil) => {
          handleAddCardToDeck(card, category, qty, foil);
        }}
        onAddCardToCollection={(card, qty, foil, cond, price) => {
          handleAddCardToCollection(card, qty, foil, cond, price);
        }}
      />

      {/* Turso Database Sync Modal */}
      <SyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        syncStatus={syncStatus}
        onVaultChanged={handleVaultChanged}
        onOpenDiagnostics={() => setShowDiagnosticsModal(true)}
        onNotify={(msg, type) => showToast(msg, type)}
      />

      {/* API Diagnostics Modal */}
      <ApiDiagnosticsModal
        isOpen={showDiagnosticsModal}
        onClose={() => setShowDiagnosticsModal(false)}
        onNotify={(msg, type) => showToast(msg, type)}
      />

      {/* Global Interactive Notification Toast */}
      {globalToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md ${
              globalToast.type === 'info'
                ? 'bg-slate-900/95 border-fuchsia-500/50 text-slate-100'
                : 'bg-slate-900/95 border-emerald-500/50 text-slate-100'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                globalToast.type === 'info' ? 'bg-fuchsia-400' : 'bg-emerald-400'
              }`}
            />
            <p className="text-xs font-medium leading-relaxed">{globalToast.message}</p>
            {globalToast.actionLabel && globalToast.onAction && (
              <button
                onClick={() => {
                  globalToast.onAction?.();
                  setGlobalToast(null);
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                {globalToast.actionLabel}
              </button>
            )}
            <button
              onClick={() => setGlobalToast(null)}
              className="text-slate-400 hover:text-white text-xs ml-1 shrink-0 p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
