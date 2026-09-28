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
  Binder,
  MTGFormat
} from './types/mtg';
import { DeckService, SyncStatus } from './services/deckService';
import { AuthService, UserDto } from './services/authService';
import { Navbar } from './components/Navbar';
import { DeckList } from './components/DeckList';
import { DeckBuilder } from './components/DeckBuilder';
import { CollectionManager } from './components/CollectionManager';
import { CardSearchView } from './components/CardSearchView';
import { CardDetailModal } from './components/CardDetailModal';
import { BinderList } from './components/BinderList';
import { AuthModal, AuthMode } from './components/AuthModal';
import { LoginPage } from './components/LoginPage';
import { getCardImageUrl } from './services/scryfall';
import { getDeckCommander, isCardLegalInCommander, sortWUBRG } from './utils/deckUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'decks' | 'collection' | 'search' | 'login'>('decks');
  const [searchContext, setSearchContext] = useState<'deck' | 'binder'>('deck');
  const [searchTargetCategory, setSearchTargetCategory] = useState<DeckCategory>('main');
  const [searchPartnerMode, setSearchPartnerMode] = useState<boolean>(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [collectionCards, setCollectionCards] = useState<CollectionCard[]>([]);
  const [binders, setBinders] = useState<Binder[]>([]);
  const [activeBinder, setActiveBinder] = useState<Binder | null>(null);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');

  // Authentication State
  const [user, setUser] = useState<UserDto | null>(() => AuthService.getCurrentUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('login');
  const [authModalReason, setAuthModalReason] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  
  // Modals & Notifications
  const [inspectedCard, setInspectedCard] = useState<ScryfallCard | null>(null);
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

  // Wire auth changes and validate session in background
  useEffect(() => {
    const unsubAuth = AuthService.onAuthStateChanged((u) => {
      setUser(u);
    });
    AuthService.validateSession();
    return unsubAuth;
  }, []);

  // Subscribe to reactive database & local library state
  useEffect(() => {
    const unsubDecks = DeckService.subscribeDecks((updatedDecks) => {
      console.log(`[App] 📥 Received updated decks (${updatedDecks.length} deck(s)):`, updatedDecks.map(d => ({
        id: d.id,
        name: d.name,
        format: d.format,
        cardCount: d.cards?.length || 0,
      })));
      setDecks(updatedDecks);
      setActiveDeck(prev => {
        if (!prev) return null;
        return updatedDecks.find(d => d.id === prev.id) || prev;
      });
    });

    const unsubCol = DeckService.subscribeCollection((updatedCol) => {
      console.log(`[App] 📥 Received updated collection (${updatedCol.length} card(s))`);
      setCollectionCards(updatedCol);
    });

    const unsubBinders = DeckService.subscribeBinders((updatedBinders) => {
      console.log(`[App] 📥 Received updated binders (${updatedBinders.length} binder(s)):`, updatedBinders.map(b => ({
        id: b.id,
        name: b.name,
        cardCount: b.cards?.length || 0,
      })));
      setBinders(updatedBinders);
      setActiveBinder(prev => {
        if (!prev) return null;
        return updatedBinders.find(b => b.id === prev.id) || prev;
      });
    });

    const unsubSync = DeckService.onSyncStatusChange((status) => {
      console.log(`[App] 🔄 Sync status changed to: "${status}"`);
      setSyncStatus(status);
    });

    return () => {
      unsubDecks();
      unsubCol();
      unsubBinders();
      unsubSync();
    };
  }, [activeDeck?.id, activeBinder?.id]);

  /**
   * Helper to gate actions that require saving to user account
   */
  const requireAuth = (reason: string, action: () => Promise<void> | void): boolean => {
    if (AuthService.isLoggedIn()) return true;
    setAuthModalReason(reason);
    setAuthModalMode('login');
    setPendingAction(() => async () => {
      await action();
    });
    setAuthModalOpen(true);
    return false;
  };

  /**
   * Post-login / register handler: completes any pending action and syncs library
   */
  const handleAuthSuccess = async (loggedInUser: UserDto) => {
    setUser(loggedInUser);
    showToast(`Welcome back, ${loggedInUser.username}!`, 'success');
    if (activeTab === 'login') {
      setActiveTab('decks');
    }
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      try {
        await action();
      } catch (err: any) {
        console.error('[App] Failed to execute pending action after login:', err);
        showToast(err?.message || 'Could not save pending changes.', 'info');
      }
    }
  };

  const handleLogout = () => {
    AuthService.logout();
    setActiveDeck(null);
    setActiveBinder(null);
    showToast('Signed out of your account.', 'info');
  };

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

    // Store in-memory only as a working draft with unsaved status until user clicks Save
    DeckService.updateDeckInMemory(newDeck);
    setActiveDeck(newDeck);
    setActiveTab('decks');
    showToast(`Created draft "${newDeck.name}" - click Save when ready!`, 'info');
  };

  const handleUpdateDeck = (updatedDeck: Deck) => {
    DeckService.updateDeckInMemory(updatedDeck);
    setActiveDeck(updatedDeck);
  };

  const handleSaveDeck = async (deckToSave: Deck) => {
    if (!requireAuth(`Please sign in or create an account to save "${deckToSave.name}"!`, () => handleSaveDeck(deckToSave))) {
      return;
    }

    await DeckService.saveDeck(deckToSave);
    setActiveDeck(deckToSave);
    showToast(`Saved "${deckToSave.name}"!`, 'success');
  };

  const handleImportAsNewDeck = async (newDeck: Deck, shouldSaveCurrentDeck: boolean) => {
    if (!AuthService.isLoggedIn()) {
      // Allow importing and viewing in-memory without login
      DeckService.updateDeckInMemory(newDeck);
      setActiveDeck(newDeck);
      setActiveTab('decks');
      showToast(
        `Imported draft "${newDeck.name}" (${newDeck.cards.reduce((s, c) => s + c.quantity, 0)} cards) - sign in to save to cloud!`,
        'info',
        'Sign In to Save',
        () => {
          setAuthModalReason(`Sign in or create an account to save "${newDeck.name}"!`);
          setAuthModalMode('login');
          setPendingAction(() => async () => {
            await DeckService.saveDeck(newDeck);
            setActiveDeck(newDeck);
            showToast(`Saved "${newDeck.name}"!`, 'success');
          });
          setAuthModalOpen(true);
        }
      );
      return;
    }

    if (shouldSaveCurrentDeck && activeDeck) {
      await DeckService.saveDeck({ ...activeDeck, updatedAt: Date.now() });
    }
    await DeckService.saveDeck(newDeck);
    setActiveDeck(newDeck);
    setActiveTab('decks');
    showToast(`Imported deck "${newDeck.name}" (${newDeck.cards.reduce((s, c) => s + c.quantity, 0)} cards)!`, 'success');
  };

  const handleImportOverwriteDeck = async (overwrittenDeck: Deck, originalDeck?: Deck) => {
    if (!requireAuth(`Please sign in or create an account to save "${overwrittenDeck.name}"!`, () => handleImportOverwriteDeck(overwrittenDeck, originalDeck))) {
      return;
    }

    // 1. Save existing deck so it gets committed and archived into DeckHistory
    if (originalDeck) {
      await DeckService.saveDeck({ ...originalDeck, updatedAt: Date.now() });
    }

    // 2. Save newly imported overwritten deck, updating active deck and triggering history snapshot
    await DeckService.saveDeck(overwrittenDeck);
    setActiveDeck(overwrittenDeck);
    setActiveTab('decks');
    showToast(`Deck "${overwrittenDeck.name}" updated! Previous version saved to history.`, 'success');
  };

  const handleBatchImportCompleted = async (count: number) => {
    setActiveDeck(null);
    setActiveTab('decks');
    showToast(`Imported ${count} decks successfully!`, 'success');
  };

  const handleCreateNewDeckFromExisting = async (currentDeckToSave: Deck) => {
    if (!requireAuth(`Please sign in or create an account to save your decks!`, () => handleCreateNewDeckFromExisting(currentDeckToSave))) {
      return;
    }

    // 1. Save the existing deck with its latest modifications
    await DeckService.saveDeck({ ...currentDeckToSave, updatedAt: Date.now() });

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
    await DeckService.saveDeck(newDeck);
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
    await DeckService.deleteDeck(deckId);
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

    if (!AuthService.isLoggedIn()) {
      DeckService.updateDeckInMemory(duplicated);
      setActiveDeck(duplicated);
      setActiveTab('decks');
      showToast(`Duplicated "${sourceDeck.name}" as draft - sign in to save!`, 'info');
      return;
    }

    await DeckService.saveDeck(duplicated);
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
    const latestActiveDeck = DeckService.getLocalDecks().find(d => d.id === activeDeck.id) || activeDeck;

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
      if (category !== 'maybeboard') {
        const isBasic = /Basic Land/i.test(card.type_line || (card as any).typeLine || '');
        const hasUnlimitedRule = (card.oracle_text || card.card_faces?.[0]?.oracle_text)
          ? /A deck can have any number of/i.test(card.oracle_text || card.card_faces?.[0]?.oracle_text || '')
          : false;
        if (!isBasic && !hasUnlimitedRule) {
          const cleanName = card.name.split(' // ')[0].trim().toLowerCase();
          const alreadyInDeck = latestActiveDeck.cards.some(
            (c) => c.category !== 'maybeboard' && c.name.split(' // ')[0].trim().toLowerCase() === cleanName
          );
          if (alreadyInDeck) {
            showToast(`"${card.name}" is already in your Commander deck (1 copy limit).`, 'info');
            return;
          }
          if (quantity > 1) {
            showToast(`In Commander format, "${card.name}" is limited to 1 copy. Adding 1 copy instead.`, 'info');
            quantity = 1;
          }
        }
      }
    }

    const currentCards = [...latestActiveDeck.cards];
    const existingCardIndex = currentCards.findIndex(
      (c) => c.scryfallId === card.id && c.category === category && c.isFoil === isFoil
    );

    const priceUsd = isFoil && card.prices?.usd_foil 
      ? parseFloat(card.prices.usd_foil) 
      : (card.prices?.usd ? parseFloat(card.prices.usd) : 0);

    if (existingCardIndex >= 0) {
      currentCards[existingCardIndex] = {
        ...currentCards[existingCardIndex],
        quantity: currentCards[existingCardIndex].quantity + quantity
      };
    } else {
      const newCard: DeckCard = {
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: card.id,
        name: card.name,
        set: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        category: category,
        quantity: quantity,
        isFoil: isFoil,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        color_identity: card.color_identity,
        rarity: card.rarity,
        imageUrl: getCardImageUrl(card, 'normal'),
        priceUsd: priceUsd,
      };
      currentCards.push(newCard);
    }

    // Auto-update commander metadata if designating a commander
    let updatedCommanderName = latestActiveDeck.commanderName;
    let updatedCommanderArt = latestActiveDeck.commanderArtUrl;
    let updatedCommanderId = latestActiveDeck.commanderId;
    let updatedCommanderColors = latestActiveDeck.commanderColorIdentity;

    if (category === 'commander') {
      const commanders = currentCards.filter((c) => c.category === 'commander');
      updatedCommanderName = commanders.map((c) => c.name).join(' // ');
      updatedCommanderArt = commanders[0]?.imageUrl;
      updatedCommanderId = commanders[0]?.scryfallId;
      updatedCommanderColors = sortWUBRG(
        Array.from(new Set(commanders.flatMap((c) => c.color_identity || [])))
      );
    }

    const updatedDeck: Deck = {
      ...latestActiveDeck,
      cards: currentCards,
      commanderName: updatedCommanderName,
      commanderArtUrl: updatedCommanderArt,
      commanderId: updatedCommanderId,
      commanderColorIdentity: updatedCommanderColors,
      updatedAt: Date.now(),
    };

    DeckService.updateDeckInMemory(updatedDeck);
    setActiveDeck(updatedDeck);
    showToast(
      `Added ${quantity}x "${card.name}" to ${latestActiveDeck.name}`,
      'success',
      'Return to Deck →',
      () => setActiveTab('decks')
    );
  };

  // Add card from collection to active deck
  const handleAddCollectionItemToDeck = async (item: CollectionCard) => {
    if (!activeDeck) {
      showToast('Please select a deck first from the Decks tab!', 'info');
      setActiveTab('decks');
      return;
    }

    const latestActiveDeck = DeckService.getLocalDecks().find(d => d.id === activeDeck.id) || activeDeck;

    // Commander singleton check
    if (latestActiveDeck.format === 'commander') {
      const isBasic = /Basic Land/i.test(item.type_line || '');
      const hasUnlimitedRule = item.oracle_text
        ? /A deck can have any number of/i.test(item.oracle_text)
        : false;
      if (!isBasic && !hasUnlimitedRule) {
        const cleanName = item.name.split(' // ')[0].trim().toLowerCase();
        const alreadyInDeck = latestActiveDeck.cards.some(
          (c) => c.category !== 'maybeboard' && c.name.split(' // ')[0].trim().toLowerCase() === cleanName
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

    DeckService.updateDeckInMemory(updatedDeck);
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
    if (!requireAuth('Please sign in or create an account to save cards to your collection binder!', () => handleAddCardToCollection(card, quantity, isFoil, condition, acquiredPrice))) {
      return;
    }

    let targetBinder = activeBinder;

    // Auto-create a binder with a generic name if none exists
    if (!targetBinder) {
      if (binders.length > 0) {
        targetBinder = binders[0];
      } else {
        targetBinder = await DeckService.createBinder('Main Binder', 'Default collection binder');
        setActiveBinder(targetBinder);
      }
    }

    const targetBinderId = targetBinder.id;
    
    // Get latest collection directly to prevent race conditions from double-clicks
    const latestCollection = DeckService.getLocalCollection();
    const existing = latestCollection.find(
      (c) =>
        c.scryfallId === card.id &&
        c.isFoil === isFoil &&
        c.condition === condition &&
        ((c.binderId || 'binder-main') === targetBinderId)
    );

    const priceUsd = isFoil && card.prices?.usd_foil
      ? parseFloat(card.prices.usd_foil)
      : (card.prices?.usd ? parseFloat(card.prices.usd) : 0);

    if (existing) {
      const updated: CollectionCard = {
        ...existing,
        quantity: existing.quantity + quantity,
      };
      await DeckService.saveCollectionCard(updated);
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
      await DeckService.saveCollectionCard(newColCard);
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
    if (!requireAuth(`Please sign in or create an account to save binder "${name}"!`, () => handleCreateBinder(name, description))) {
      return;
    }

    const newBinder = await DeckService.createBinder(name, description);
    setActiveBinder(newBinder);
    showToast(`Created binder "${name}"`);
  };

  const handleDeleteBinder = async (binderId: string) => {
    await DeckService.deleteBinder(binderId);
    if (activeBinder?.id === binderId) {
      setActiveBinder(null);
    }
    showToast('Binder deleted');
  };

  const handleUpdateCollectionCard = async (card: CollectionCard) => {
    if (!requireAuth('Please sign in or create an account to update cards in your collection!', () => handleUpdateCollectionCard(card))) {
      return;
    }
    await DeckService.saveCollectionCard(card);
  };

  const handleDeleteCollectionCard = async (cardId: string) => {
    await DeckService.deleteCollectionCard(cardId);
    showToast('Removed from binder');
  };

  // Top-level tab change handler:
  const handleTabChange = async (tab: 'decks' | 'collection' | 'search' | 'login') => {
    if (tab === 'decks') {
      setActiveDeck(null);
      setActiveTab('decks');
    } else if (tab === 'collection') {
      if (activeBinder && AuthService.isLoggedIn()) {
        await DeckService.saveBinder({ ...activeBinder, updatedAt: Date.now() });
      }
      setActiveBinder(null);
      setActiveTab('collection');
    } else {
      setActiveTab(tab);
    }
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
        user={user}
        onOpenAuth={(mode) => {
          setAuthModalMode(mode || 'login');
          setAuthModalReason(undefined);
          setAuthModalOpen(true);
        }}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6 sm:py-8">
        {/* Dedicated Login Tab */}
        {activeTab === 'login' && (
          <LoginPage
            onLoginSuccess={handleAuthSuccess}
            onNavigateHome={() => setActiveTab('decks')}
            reason={authModalReason}
          />
        )}

        {/* Decks Tab */}
        <div className={activeTab === 'decks' ? 'block' : 'hidden'}>
          {activeDeck ? (
            <DeckBuilder
              deck={activeDeck}
              onBack={() => {
                setActiveDeck(null);
              }}
              onUpdateDeck={handleUpdateDeck}
              onSaveDeck={handleSaveDeck}
              onDeleteDeck={handleDeleteDeck}
              onOpenSearch={(category) => {
                setSearchContext('deck');
                if (category === 'partner') {
                  setSearchTargetCategory('commander');
                  setSearchPartnerMode(true);
                } else {
                  if (category) setSearchTargetCategory(category);
                  setSearchPartnerMode(false);
                }
                setActiveTab('search');
              }}
              onSelectCard={(c) => setInspectedCard(c)}
              onCreateNewDeck={handleCreateNewDeckFromExisting}
              onImportAsNewDeck={handleImportAsNewDeck}
              onBatchImportCompleted={handleBatchImportCompleted}
            />
          ) : (
            <DeckList
              decks={decks}
              onSelectDeck={(d) => setActiveDeck(d)}
              onCreateDeck={handleCreateDeck}
              onDuplicateDeck={handleDuplicateDeck}
              onDeleteDeck={handleDeleteDeck}
              onSaveDeck={handleSaveDeck}
              onImportDeck={handleImportAsNewDeck}
              onImportOverwriteDeck={handleImportOverwriteDeck}
              onBatchImportCompleted={handleBatchImportCompleted}
            />
          )}
        </div>

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
                if (activeBinder && AuthService.isLoggedIn()) {
                  await DeckService.saveBinder({ ...activeBinder, updatedAt: Date.now() });
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
            initialTargetCategory={searchTargetCategory}
            initialPartnerMode={searchPartnerMode}
            onResetPartnerSearchRequest={() => setSearchPartnerMode(false)}
            searchContext={searchContext}
            onSetSearchContext={(ctx) => setSearchContext(ctx)}
            activeDeck={activeDeck}
            onUpdateDeck={handleUpdateDeck}
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

      {/* Auth Modal (Sign In / Register / Change Password) */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        reason={authModalReason}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingAction(null);
          setAuthModalReason(undefined);
        }}
        onSuccess={handleAuthSuccess}
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
