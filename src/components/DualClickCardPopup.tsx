import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCw, Sparkles } from 'lucide-react';

export interface DualClickCardInfo {
  name: string;
  imageUrl?: string;
  backImageUrl?: string;
  scryfallId?: string;
  manaCost?: string;
  typeLine?: string;
  price?: string | number;
  isFoil?: boolean;
}

export function useCardDualClickPeek() {
  const [peekCard, setPeekCard] = useState<DualClickCardInfo | null>(null);
  const lastLeftDownTimeRef = useRef<number>(0);
  const lastRightDownTimeRef = useRef<number>(0);
  const isLeftDownRef = useRef<boolean>(false);
  const isRightDownRef = useRef<boolean>(false);
  const chordTriggeredRef = useRef<boolean>(false);
  const chordTriggeredTimeRef = useRef<number>(0);

  const triggerChord = (e: React.SyntheticEvent, cardInfo: DualClickCardInfo) => {
    chordTriggeredRef.current = true;
    chordTriggeredTimeRef.current = Date.now();
    e.preventDefault();
    e.stopPropagation();
    setPeekCard(cardInfo);
  };

  const handleCardMouseDown = (e: React.MouseEvent, cardInfo: DualClickCardInfo) => {
    const now = Date.now();

    // Right-click OR Middle-click (scroll wheel) triggers large card peek
    if (e.button === 2 || e.button === 1) {
      triggerChord(e, cardInfo);
      return;
    }

    if (e.button === 0) {
      isLeftDownRef.current = true;
      lastLeftDownTimeRef.current = now;

      // If right button was clicked recently or is held down
      if ((e.buttons & 2) !== 0 || now - lastRightDownTimeRef.current < 600) {
        triggerChord(e, cardInfo);
        return;
      }
    }

    // Both buttons currently held down
    const bothButtonsHeld = (e.buttons & 1) !== 0 && (e.buttons & 2) !== 0;

    // Both buttons pressed down within 500ms of each other
    const bothPressedRecently =
      Math.abs(lastLeftDownTimeRef.current - lastRightDownTimeRef.current) < 500 &&
      lastLeftDownTimeRef.current > 0 &&
      lastRightDownTimeRef.current > 0 &&
      now - Math.max(lastLeftDownTimeRef.current, lastRightDownTimeRef.current) < 600;

    if (bothButtonsHeld || bothPressedRecently) {
      triggerChord(e, cardInfo);
    }
  };

  const handleCardMouseUp = (e: React.MouseEvent, cardInfo: DualClickCardInfo) => {
    const now = Date.now();
    const bothPressedRecently =
      Math.abs(lastLeftDownTimeRef.current - lastRightDownTimeRef.current) < 500 &&
      lastLeftDownTimeRef.current > 0 &&
      lastRightDownTimeRef.current > 0 &&
      now - Math.max(lastLeftDownTimeRef.current, lastRightDownTimeRef.current) < 600;

    if (bothPressedRecently) {
      triggerChord(e, cardInfo);
    }
  };

  const handleCardContextMenu = (e: React.MouseEvent, cardInfo?: DualClickCardInfo) => {
    // ALWAYS suppress browser context menu on cards and trigger large card peek
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    lastRightDownTimeRef.current = now;

    if (cardInfo) {
      triggerChord(e, cardInfo);
    }
  };

  const handleCardAuxClick = (e: React.MouseEvent, cardInfo: DualClickCardInfo) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 1 || e.button === 2) {
      triggerChord(e, cardInfo);
    }
  };

  const wasChordTriggeredRecently = () => {
    return (
      chordTriggeredRef.current ||
      Date.now() - chordTriggeredTimeRef.current < 600
    );
  };

  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isLeftDownRef.current = false;
      if (e.button === 2) isRightDownRef.current = false;
      if (e.buttons === 0) {
        isLeftDownRef.current = false;
        isRightDownRef.current = false;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return {
    peekCard,
    setPeekCard,
    wasChordTriggeredRecently,
    getCardChordProps: (cardInfo: DualClickCardInfo) => ({
      onMouseDown: (e: React.MouseEvent) => handleCardMouseDown(e, cardInfo),
      onMouseUp: (e: React.MouseEvent) => handleCardMouseUp(e, cardInfo),
      onContextMenu: (e: React.MouseEvent) => handleCardContextMenu(e, cardInfo),
      onAuxClick: (e: React.MouseEvent) => handleCardAuxClick(e, cardInfo),
    }),
  };
}

interface DualClickCardModalProps {
  card: DualClickCardInfo | null;
  onClose: () => void;
}

export const DualClickCardModal: React.FC<DualClickCardModalProps> = ({ card, onClose }) => {
  const [showBackFace, setShowBackFace] = useState(false);

  useEffect(() => {
    setShowBackFace(false);
  }, [card?.name, card?.scryfallId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key.toLowerCase() === 'f' && card?.backImageUrl) {
        setShowBackFace((prev) => !prev);
      }
    };
    if (card) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, onClose]);

  if (!card) return null;

  // Resolve best high resolution image
  let frontImage = card.imageUrl;
  if (frontImage) {
    frontImage = frontImage.replace('version=small', 'version=large').replace('version=normal', 'version=large');
  } else if (card.scryfallId) {
    frontImage = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=large`;
  }

  let backImage = card.backImageUrl;
  if (backImage) {
    backImage = backImage.replace('version=small', 'version=large').replace('version=normal', 'version=large');
  } else if (card.scryfallId && showBackFace) {
    backImage = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=large&face=back`;
  }

  const activeImage = showBackFace && backImage ? backImage : frontImage || 'https://cards.scryfall.io/back.jpg';
  const hasBackFace = Boolean(card.backImageUrl);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 select-none cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative max-w-sm sm:max-w-md w-full flex flex-col items-center cursor-default animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Top Controls */}
        <div className="w-full flex items-center justify-between pb-2 text-white px-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-slate-100 truncate shadow-black drop-shadow-md">
              {card.name}
            </h3>
            {card.isFoil && (
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Foil
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasBackFace && (
              <button
                type="button"
                onClick={() => setShowBackFace((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shadow-md cursor-pointer"
                title="Flip double-faced card (F)"
              >
                <RotateCw className="w-3 h-3 text-violet-400" />
                <span>{showBackFace ? 'Front' : 'Back'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors shadow-lg cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* High Resolution Card Visual */}
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 bg-slate-950 aspect-[5/7] w-full max-h-[80vh] flex items-center justify-center">
          <img
            src={activeImage}
            alt={card.name}
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              if (card.scryfallId && !e.currentTarget.src.includes('format=image')) {
                e.currentTarget.src = `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=large${showBackFace ? '&face=back' : ''}`;
              }
            }}
          />
        </div>

        {/* Subtle Footer Details */}
        <div className="w-full mt-2 flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="truncate">{card.typeLine || ''}</span>
          {card.price !== undefined && card.price !== null && (
            <span className="font-mono text-emerald-400 font-semibold shrink-0">
              ${typeof card.price === 'number' ? card.price.toFixed(2) : card.price}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
