/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { CardScannerModal } from './components/CardScannerModal';
import { BinderList } from './components/BinderList';
import { AuthModal, AuthMode } from './components/AuthModal';
import { LoginPage } from './components/LoginPage';
import { getCardImageUrl, getCardBackImageUrl } from './services/api';
import { GamechangerService } from './services/gamechangerService';
import { scrollToTop } from './utils/scrollUtils';
import { canHaveAnyNumberOfCopies, getDeckCommander, isCardGamechanger, isCardLegalInCommander, sortWUBRG } from './utils/deckUtils';
import { getTcgplayerMarketPrice } from './utils/priceUtils';

export default function App() {
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialDeckId = initialParams?.get('deck');
  const initialBinderId = initialParams?.get('binder');
  const initialTabParam = initialParams?.get('tab') as 'decks' | 'collection' | 'search' | 'login' | null;

  const [activeTab, setActiveTab] = useState<'decks' | 'collection' | 'search' | 'login'>(() => {
    if (initialBinderId) return 'collection';
    if (initialDeckId) return 'decks';
    if (initialTabParam && ['decks', 'collection', 'search', 'login'].includes(initialTabParam)) {
      return initialTabParam;
    }
    return 'decks';
  });
  const [searchContext, setSearchContext] = useState<'deck' | 'binder'>('deck');
  const [searchTargetCategory, setSearchTargetCategory] = useState<DeckCategory>('main');
  const [searchPartnerMode, setSearchPartnerMode] = useState<boolean>(false);
  const [decks, setDecks] = useState<Deck[]>(() => DeckService.getLocalDecks());
  const [collectionCards, setCollectionCards] = useState<CollectionCard[]>(() => DeckService.getLocalCollection());
  const [binders, setBinders] = useState<Binder[]>(() => DeckService.getLocalBinders());
  const [activeBinder, setActiveBinder] = useState<Binder | null>(() => {
    if (initialBinderId) {
      return DeckService.getLocalBinders().find((b) => b.id === initialBinderId) || null;
    }
    return null;
  });
  const [activeDeck, setActiveDeck] = useState<Deck | null>(() => {
    if (initialDeckId) {
      return DeckService.getLocalDecks().find((d) => d.id === initialDeckId) || null;
    }
    return null;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');

  // Authentication State
  const [user, setUser] = useState<UserDto | null>(() => AuthService.getCurrentUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('login');
  const [authModalReason, setAuthModalReason] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  // Browser navigation & history tracking refs
  const prevActiveDeckIdRef = useRef<string | null>(null);
  const prevActiveBinderIdRef = useRef<string | null>(null);
  const isPopStateNavigationRef = useRef<boolean>(false);
  
  // Modals & Notifications
  const [inspectedCard, setInspectedCard] = useState<ScryfallCard | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
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
    // User request: "Remove the success popup from the bottom of the screen"
    if (type === 'success' && !actionLabel) {
      return;
    }
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
    // Check initial URL parameters for deep-linking in new tabs
    const params = new URLSearchParams(window.location.search);
    const initialDeckId = params.get('deck');
    const initialBinderId = params.get('binder');
    const initialTab = params.get('tab') as 'decks' | 'collection' | 'search' | 'login' | null;

    if (initialTab && ['decks', 'collection', 'search', 'login'].includes(initialTab)) {
      setActiveTab(initialTab);
    }

    const unsubDecks = DeckService.subscribeDecks((updatedDecks) => {
      console.log(`[App] 📥 Received updated decks (${updatedDecks.length} deck(s)):`, updatedDecks.map(d => ({
        id: d.id,
        name: d.name,
        format: d.format,
        cardCount: d.cards?.length || 0,
      })));
      setDecks(updatedDecks);
      setActiveDeck(prev => {
        if (prev) {
          return updatedDecks.find(d => d.id === prev.id) || prev;
        }
        if (initialDeckId) {
          const match = updatedDecks.find(d => d.id === initialDeckId);
          if (match) {
            setActiveTab('decks');
            return match;
          }
        }
        return null;
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
        if (prev) {
          return updatedBinders.find(b => b.id === prev.id) || prev;
        }
        if (initialBinderId) {
          const match = updatedBinders.find(b => b.id === initialBinderId);
          if (match) {
            setActiveTab('collection');
            return match;
          }
        }
        return null;
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
  }, []);

  // Seed the grid as base history entry if user opened directly to a deck or binder deep-link
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const initialDeckId = params.get('deck');
      const initialBinderId = params.get('binder');

      if (initialDeckId || initialBinderId) {
        const gridUrl = new URL(window.location.href);
        gridUrl.searchParams.delete('deck');
        gridUrl.searchParams.delete('binder');
        if (initialBinderId) {
          gridUrl.searchParams.set('tab', 'collection');
        } else {
          gridUrl.searchParams.delete('tab');
        }

        // Replace the root entry with the grid so pressing Back returns to grid rather than leaving site
        window.history.replaceState(
          { deckId: null, binderId: null, tab: initialBinderId ? 'collection' : 'decks' },
          '',
          gridUrl.toString()
        );
        // Push the active deck/binder on top
        window.history.pushState(
          { deckId: initialDeckId, binderId: initialBinderId, tab: initialBinderId ? 'collection' : 'decks' },
          '',
          window.location.href
        );
        prevActiveDeckIdRef.current = initialDeckId;
        prevActiveBinderIdRef.current = initialBinderId;
      }
    } catch (e) {
      console.warn('Initial history seeding failed:', e);
    }
  }, []);

  // Synchronize URL search params to reflect active deck, binder, and tab for new tabs/sharing & browser history
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const currentDeckId = activeDeck?.id || null;
      const currentBinderId = activeBinder?.id || null;

      if (activeDeck) {
        url.searchParams.set('deck', activeDeck.id);
        url.searchParams.delete('binder');
        url.searchParams.delete('tab');
      } else if (activeBinder) {
        url.searchParams.set('binder', activeBinder.id);
        url.searchParams.delete('deck');
        url.searchParams.delete('tab');
      } else {
        url.searchParams.delete('deck');
        url.searchParams.delete('binder');
        if (activeTab !== 'decks') {
          url.searchParams.set('tab', activeTab);
        } else {
          url.searchParams.delete('tab');
        }
      }

      if (isPopStateNavigationRef.current) {
        // Triggered by browser forward/back button navigation - history state already popped/pushed
        isPopStateNavigationRef.current = false;
        prevActiveDeckIdRef.current = currentDeckId;
        prevActiveBinderIdRef.current = currentBinderId;
        return;
      }

      const didEnterDeck = currentDeckId && currentDeckId !== prevActiveDeckIdRef.current;
      const didEnterBinder = currentBinderId && currentBinderId !== prevActiveBinderIdRef.current;

      if (didEnterDeck || didEnterBinder) {
        // Navigating into a deck or binder from grid -> push new history entry so Back button returns to grid!
        window.history.pushState(
          { deckId: currentDeckId, binderId: currentBinderId, tab: activeTab },
          '',
          url.toString()
        );
      } else {
        window.history.replaceState(
          { deckId: currentDeckId, binderId: currentBinderId, tab: activeTab },
          '',
          url.toString()
        );
      }

      prevActiveDeckIdRef.current = currentDeckId;
      prevActiveBinderIdRef.current = currentBinderId;
    } catch (err) {
      console.error('URL sync error:', err);
    }
  }, [activeDeck?.id, activeBinder?.id, activeTab]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      isPopStateNavigationRef.current = true;
      const params = new URLSearchParams(window.location.search);
      const deckId = params.get('deck') || event.state?.deckId || null;
      const binderId = params.get('binder') || event.state?.binderId || null;
      const tab = (params.get('tab') || event.state?.tab) as 'decks' | 'collection' | 'search' | 'login' | null;

      const wasInBinder = Boolean(prevActiveBinderIdRef.current);
      prevActiveDeckIdRef.current = deckId;
      prevActiveBinderIdRef.current = binderId;

      if (deckId) {
        const foundDeck = DeckService.getLocalDecks().find(d => d.id === deckId);
        if (foundDeck) {
          setActiveDeck(foundDeck);
          setActiveBinder(null);
          setActiveTab('decks');
          return;
        }
      }
      if (binderId) {
        const foundBinder = DeckService.getLocalBinders().find(b => b.id === binderId);
        if (foundBinder) {
          setActiveBinder(foundBinder);
          setActiveDeck(null);
          setActiveTab('collection');
          return;
        }
      }
      // No deck or binder in URL -> return to main page!
      setActiveDeck(null);
      setActiveBinder(null);
      if (tab && ['decks', 'collection', 'search', 'login'].includes(tab)) {
        setActiveTab(tab);
      } else if (wasInBinder) {
        // Navigating back after clicking on a binder -> return to main binder page!
        setActiveTab('collection');
      } else {
        setActiveTab('decks');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  // Always scroll back to the top of the screen when entering a deck
  useEffect(() => {
    if (activeDeck) {
      scrollToTop();
    }
  }, [activeDeck?.id]);

  // Always scroll back to the top of the screen when entering a binder
  useEffect(() => {
    if (activeBinder) {
      scrollToTop();
    }
  }, [activeBinder?.id]);

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

  const handleUpdateDeck = (updatedDeck: Deck, markUnsaved = true) => {
    if (markUnsaved) {
      DeckService.updateDeckInMemory(updatedDeck);
    } else {
      DeckService.updateDeckMetadataInMemory(updatedDeck);
    }
    setActiveDeck(updatedDeck);
  };

  const handleSaveDeck = async (deckToSave: Deck) => {
    if (!requireAuth(`Please sign in or create an account to save "${deckToSave.name}"!`, () => handleSaveDeck(deckToSave))) {
      return;
    }

    await DeckService.saveDeck(deckToSave);
    DeckService.setLastSavedDeck(deckToSave);
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

    // Check format legality & ban list (warn user but allow adding for casual/Rule-0 play)
    if (card.legalities && card.legalities[latestActiveDeck.format] === 'banned') {
      showToast(
        `Added "${card.name}" (Note: Banned in ${latestActiveDeck.format} format).`,
        'info'
      );
    }

    // Check Commander rules
    if (latestActiveDeck.format === 'commander') {
      const commanderInfo = getDeckCommander(latestActiveDeck);
      const cmdrColors = commanderInfo.colorIdentity.length > 0
        ? commanderInfo.colorIdentity
        : (latestActiveDeck.commanderColorIdentity && latestActiveDeck.commanderColorIdentity.length > 0
          ? sortWUBRG(latestActiveDeck.commanderColorIdentity)
          : []);
      const hasCmdr = Boolean(commanderInfo.hasCommander || cmdrColors.length > 0 || latestActiveDeck.commanderName);

      // If adding as regular card (not designating commander), check color identity against existing commander
      if (category !== 'commander' && hasCmdr && cmdrColors.length > 0) {
        const legality = isCardLegalInCommander(card, cmdrColors, { allowBanned: true });
        if (!legality.isLegal) {
          showToast(
            `Illegal Card: "${card.name}" color identity does not fit Commander ${commanderInfo.commanderName || latestActiveDeck.commanderName || 'commander'} (${cmdrColors.join('') || 'C'})`,
            'info'
          );
          return;
        }
      }

      // Check singleton rule for commander decks across ALL boards (Main, Side, Maybe, Commander)
      const isUnlimited = canHaveAnyNumberOfCopies(card);
      if (!isUnlimited) {
        const cleanName = card.name.split(' // ')[0].trim().toLowerCase();
        const alreadyInDeck = latestActiveDeck.cards.some(
          (c) => c.name.split(' // ')[0].trim().toLowerCase() === cleanName
        );
        if (alreadyInDeck) {
          showToast(`"${card.name}" is already in your Commander deck (1 copy limit across Main, Side, and Maybeboard).`, 'info');
          return;
        }
        if (quantity > 1) {
          showToast(`In Commander format, "${card.name}" is limited to 1 copy. Adding 1 copy instead.`, 'info');
          quantity = 1;
        }
      }
    }

    const currentCards = [...latestActiveDeck.cards];
    const existingCardIndex = currentCards.findIndex(
      (c) => c.scryfallId === card.id && c.category === category && c.isFoil === isFoil
    );

    const priceUsd = getTcgplayerMarketPrice(card, isFoil);

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
        printed_name: card.printed_name,
        printedName: card.printed_name,
        flavor_name: card.flavor_name,
        flavorName: card.flavor_name,
        set: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        category: category,
        quantity: quantity,
        isFoil: isFoil,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        type_line: card.type_line,
        oracle_text: card.oracle_text || (card as any).oracleText,
        colors: card.colors,
        color_identity: card.color_identity,
        rarity: card.rarity,
        imageUrl: getCardImageUrl(card, 'normal'),
        priceUsd: priceUsd,
        isGamechanger: isCardGamechanger(card),
        game_changer: isCardGamechanger(card),
        is_game_changer: isCardGamechanger(card),
        isGameChanger: isCardGamechanger(card),
        IsGameChanger: isCardGamechanger(card),
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

    // Commander singleton and color identity check
    if (latestActiveDeck.format === 'commander') {
      const commanderInfo = getDeckCommander(latestActiveDeck);
      const cmdrColors = commanderInfo.colorIdentity.length > 0
        ? commanderInfo.colorIdentity
        : (latestActiveDeck.commanderColorIdentity && latestActiveDeck.commanderColorIdentity.length > 0
          ? sortWUBRG(latestActiveDeck.commanderColorIdentity)
          : []);
      const hasCmdr = Boolean(commanderInfo.hasCommander || cmdrColors.length > 0 || latestActiveDeck.commanderName);

      if (hasCmdr && cmdrColors.length > 0) {
        const legality = isCardLegalInCommander(item, cmdrColors, { allowBanned: true });
        if (!legality.isLegal) {
          showToast(
            `Illegal Card: "${item.name}" color identity does not fit Commander ${commanderInfo.commanderName || latestActiveDeck.commanderName || 'commander'} (${cmdrColors.join('') || 'C'})`,
            'info'
          );
          return;
        }
      }

      const isUnlimited = canHaveAnyNumberOfCopies(item);
      if (!isUnlimited) {
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
        isGamechanger: Boolean((item as any).game_changer),
        game_changer: Boolean((item as any).game_changer),
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
    acquiredPrice?: number,
    targetBinderIdParam?: string
  ) => {
    if (!requireAuth('Please sign in or create an account to save cards to your collection binder!', () => handleAddCardToCollection(card, quantity, isFoil, condition, acquiredPrice, targetBinderIdParam))) {
      return;
    }

    let targetBinder = targetBinderIdParam
      ? (binders.find(b => b.id === targetBinderIdParam) || activeBinder)
      : activeBinder;

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

    const priceUsd = getTcgplayerMarketPrice(card, isFoil);

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
  };

  const handleUpdateCardInBinder = async (
    oldCard: ScryfallCard,
    oldFoil: boolean,
    newCard: ScryfallCard,
    newFoil: boolean,
    quantity: number,
    targetBinderIdParam?: string
  ) => {
    const targetBinderId = targetBinderIdParam || activeBinder?.id || 'binder-main';
    const targetBinder = binders.find((b) => b.id === targetBinderId) || binders[0];
    if (!targetBinder) return;

    const binderCards = [...(targetBinder.cards || [])];

    // 1. Decrement or remove old card
    const oldIdx = binderCards.findIndex(
      (c) => c.scryfallId === oldCard.id && c.isFoil === oldFoil
    );
    if (oldIdx >= 0) {
      if (binderCards[oldIdx].quantity <= quantity) {
        binderCards.splice(oldIdx, 1);
      } else {
        binderCards[oldIdx] = {
          ...binderCards[oldIdx],
          quantity: binderCards[oldIdx].quantity - quantity,
        };
      }
    }

    // 2. Add or increment new card
    const newPriceUsd = getTcgplayerMarketPrice(newCard, newFoil);

    const newIdx = binderCards.findIndex(
      (c) => c.scryfallId === newCard.id && c.isFoil === newFoil
    );
    if (newIdx >= 0) {
      binderCards[newIdx] = {
        ...binderCards[newIdx],
        quantity: binderCards[newIdx].quantity + quantity,
      };
    } else {
      const newColCard: CollectionCard = {
        id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        scryfallId: newCard.id,
        binderId: targetBinderId,
        name: newCard.name,
        printed_name: newCard.printed_name,
        printedName: newCard.printed_name,
        flavor_name: newCard.flavor_name,
        flavorName: newCard.flavor_name,
        set: newCard.set,
        setName: newCard.set_name,
        collectorNumber: newCard.collector_number,
        quantity,
        isFoil: newFoil,
        condition: 'NM',
        cmc: newCard.cmc,
        mana_cost: newCard.mana_cost,
        type_line: newCard.type_line,
        colors: newCard.colors,
        color_identity: newCard.color_identity,
        rarity: newCard.rarity,
        imageUrl: getCardImageUrl(newCard, 'normal'),
        acquiredPrice: newPriceUsd,
        currentPriceUsd: newPriceUsd,
        addedAt: Date.now(),
      };
      binderCards.unshift(newColCard);
    }

    const updatedBinder: Binder = {
      ...targetBinder,
      cards: binderCards,
      cardCount: binderCards.reduce((acc, c) => acc + c.quantity, 0),
      updatedAt: Date.now(),
    };

    await DeckService.saveBinder(updatedBinder);
    setCollectionCards(DeckService.getLocalCollection());
    showToast(`Updated to ${newCard.set.toUpperCase()} #${newCard.collector_number} (${newFoil ? 'Foil' : 'Regular'})`);
  };

  const handleDeleteCardFromBinder = async (
    card: ScryfallCard,
    isFoil: boolean,
    quantity: number,
    targetBinderIdParam?: string
  ) => {
    const targetBinderId = targetBinderIdParam || activeBinder?.id || 'binder-main';
    const targetBinder = binders.find((b) => b.id === targetBinderId) || binders[0];
    if (!targetBinder) return;

    const binderCards = [...(targetBinder.cards || [])];
    const oldIdx = binderCards.findIndex(
      (c) => c.scryfallId === card.id && c.isFoil === isFoil
    );
    if (oldIdx >= 0) {
      if (binderCards[oldIdx].quantity <= quantity) {
        binderCards.splice(oldIdx, 1);
      } else {
        binderCards[oldIdx] = {
          ...binderCards[oldIdx],
          quantity: binderCards[oldIdx].quantity - quantity,
        };
      }
    }

    const updatedBinder: Binder = {
      ...targetBinder,
      cards: binderCards,
      cardCount: binderCards.reduce((acc, c) => acc + c.quantity, 0),
      updatedAt: Date.now(),
    };

    await DeckService.saveBinder(updatedBinder);
    setCollectionCards(DeckService.getLocalCollection());
    showToast(`Removed "${card.name}" from binder`);
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

  const handleToggleCardFoil = async (
    cardId: string,
    options?: { countToConvert?: number; targetFoil?: boolean }
  ) => {
    if (!requireAuth('Please sign in or create an account to update cards in your collection!', () => handleToggleCardFoil(cardId, options))) {
      return;
    }
    try {
      const result = await DeckService.toggleCollectionCardFoil(cardId, options);
      showToast(
        result.merged
          ? `Merged ${result.countConverted}x into existing ${result.newFoil ? 'Foil' : 'Regular'} stack`
          : `Changed ${result.countConverted}x to ${result.newFoil ? 'Foil ✨' : 'Regular'}`
      );
    } catch (err: any) {
      console.error('[App] Failed to toggle card foil:', err);
      showToast('Could not update card finish');
    }
  };

  const handleDeleteCollectionCard = async (cardId: string) => {
    await DeckService.deleteCollectionCard(cardId);
    showToast('Removed from binder');
  };

  // Top-level tab change handler:
  // Update the printing / artwork of a card in the active deck
  const handleUpdateCardPrinting = (targetCard: ScryfallCard, newPrinting: ScryfallCard) => {
    if (!activeDeck) return;
    const targetScryfallId = targetCard.id || (targetCard as any).scryfallId;
    const targetDeckCardId = (targetCard as any).deckCardId;
    const targetName = (targetCard.name || '').trim().toLowerCase();

    const newImageUrl = getCardImageUrl(newPrinting, 'large') || getCardImageUrl(newPrinting, 'normal');
    const newBackImageUrl = getCardBackImageUrl(newPrinting);

    let updatedAny = false;
    const updatedCards = (activeDeck.cards || []).map((c) => {
      const isMatch = targetDeckCardId
        ? c.id === targetDeckCardId
        : (c.scryfallId && targetScryfallId && c.scryfallId === targetScryfallId) ||
          (c.name.trim().toLowerCase() === targetName);

      if (!isMatch) return c;
      updatedAny = true;
      return {
        ...c,
        scryfallId: newPrinting.id,
        set: newPrinting.set,
        set_name: newPrinting.set_name,
        setName: newPrinting.set_name,
        collector_number: newPrinting.collector_number,
        collectorNumber: newPrinting.collector_number,
        rarity: newPrinting.rarity || c.rarity,
        imageUrl: newImageUrl || c.imageUrl,
        backImageUrl: newBackImageUrl || c.backImageUrl,
        priceUsd: getTcgplayerMarketPrice(newPrinting, false) || c.priceUsd,
        priceUsdFoil: getTcgplayerMarketPrice(newPrinting, true) || c.priceUsdFoil,
      };
    });

    if (updatedAny) {
      let newCommanderArt = activeDeck.commanderArtUrl;
      let newCommanderId = activeDeck.commanderId;
      let newCoverCard = activeDeck.coverCardUrl;

      const cmdrCard = updatedCards.find((c) => c.category === 'commander');
      if (cmdrCard && (cmdrCard.id === targetDeckCardId || cmdrCard.name.trim().toLowerCase() === targetName)) {
        newCommanderArt = newImageUrl;
        newCommanderId = newPrinting.id;
        newCoverCard = newImageUrl;
      }

      const updatedDeck: Deck = {
        ...activeDeck,
        cards: updatedCards,
        commanderArtUrl: newCommanderArt,
        commanderId: newCommanderId,
        coverCardUrl: newCoverCard,
        updatedAt: Date.now(),
      };
      handleUpdateDeck(updatedDeck, true);
      showToast('Updated printing for "' + targetCard.name + '" to ' + (newPrinting.set || '').toUpperCase() + ' #' + newPrinting.collector_number, 'success');
    }
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
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 text-slate-100 font-sans flex flex-col selection:bg-fuchsia-500 selection:text-slate-950 overflow-x-hidden max-w-full w-full">
      {/* Navigation */}
      <Navbar
        binders={binders}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        decks={decks}
        collection={collectionCards}
        activeDeck={activeDeck}
        onSelectActiveDeck={(deck) => {
          scrollToTop();
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
      <main className="flex-1 max-w-[2560px] w-full mx-auto px-2 sm:px-3 lg:px-4 2xl:px-6 py-4 sm:py-6 overflow-x-hidden">
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
                if (window.history.length > 1 && (window.history.state?.deckId || new URLSearchParams(window.location.search).has('deck'))) {
                  window.history.back();
                } else {
                  setActiveDeck(null);
                }
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
              onSelectDeck={(d) => {
                scrollToTop();
                setActiveDeck(d);
              }}
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
              onBackToBinders={() => {
                scrollToTop();
                if (window.history.length > 1 && (window.history.state?.binderId || new URLSearchParams(window.location.search).has('binder'))) {
                  window.history.back();
                } else {
                  setActiveBinder(null);
                  setActiveTab('collection');
                }
              }}
              onSelectBinder={(b) => {
                scrollToTop();
                setActiveBinder(b);
              }}
              onCreateBinder={handleCreateBinder}
              onDeleteBinder={handleDeleteBinder}
              activeDeck={activeDeck}
              onUpdateCollectionCard={handleUpdateCollectionCard}
              onToggleCardFoil={handleToggleCardFoil}
              onDeleteCollectionCard={handleDeleteCollectionCard}
              onAddCardToDeck={handleAddCollectionItemToDeck}
              onOpenSearch={() => {
                setSearchContext('binder');
                setActiveTab('search');
              }}
              onSelectCard={(c) => setInspectedCard(c)}
              onOpenScanner={() => setIsScannerOpen(true)}
            />
          ) : (
            <BinderList 
              binders={binders}
              onSelectBinder={(b) => {
                scrollToTop();
                setActiveBinder(b);
              }}
              onCreateBinder={handleCreateBinder}
              onDeleteBinder={handleDeleteBinder}
            />
          )
        )}

        {/* Card Search Database Tab */}
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

      {/* Mobile Card Scanner Modal */}
      <CardScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        binders={binders}
        activeBinder={activeBinder}
        onAddCardToBinder={async (card, qty, isFoil, targetBinderId) => {
          await handleAddCardToCollection(card, qty, isFoil, 'NM', undefined, targetBinderId);
        }}
        onUpdateCardInBinder={handleUpdateCardInBinder}
        onDeleteCardFromBinder={handleDeleteCardFromBinder}
      />

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
        onUpdateCardPrinting={(targetCard, newPrinting) => {
          handleUpdateCardPrinting(targetCard, newPrinting);
        }}
        onToggleCardFoil={handleToggleCardFoil}
        onDeleteCollectionCard={handleDeleteCollectionCard}
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
