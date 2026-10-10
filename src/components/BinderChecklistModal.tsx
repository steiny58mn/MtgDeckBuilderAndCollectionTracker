import React from 'react';
import { BinderChecklist } from './BinderChecklist';
import { CollectionCard, Deck, Binder } from '../types/mtg';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface BinderChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CollectionCard[];
  binders?: Binder[];
  selectedBinderId: string;
  onSelectBinderId?: (binderId: string) => void;
  onUpdateCollectionCard?: (card: CollectionCard) => void;
  onAddCardToDeck?: (card: CollectionCard) => void;
  onSelectCard?: (card: CollectionCard) => void;
  activeDeck?: Deck | null;
}

export const BinderChecklistModal: React.FC<BinderChecklistModalProps> = React.memo(({
  isOpen,
  onClose,
  cards,
  binders = [],
  selectedBinderId,
  onSelectBinderId,
  onUpdateCollectionCard,
  onAddCardToDeck,
  onSelectCard,
  activeDeck,
}) => {
  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-5xl h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <BinderChecklist
          cards={cards}
          binders={binders}
          selectedBinderId={selectedBinderId}
          onSelectBinderId={onSelectBinderId}
          onUpdateCollectionCard={onUpdateCollectionCard}
          onAddCardToDeck={onAddCardToDeck}
          onSelectCard={onSelectCard}
          activeDeck={activeDeck}
          onClose={onClose}
          isModal={true}
        />
      </div>
    </div>
  );
});
