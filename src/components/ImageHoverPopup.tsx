import React, { useState, useEffect, useRef } from 'react';

export interface ImageHoverInfo {
  imageUrl: string;
  fallbackUrl?: string;
  name?: string;
  backImageUrl?: string;
  scryfallId?: string;
}

export interface ActiveHoverPreview extends ImageHoverInfo {
  x: number;
  y: number;
}

export function useImageHoverPreview(delay: number = 500) {
  const [activePreview, setActivePreview] = useState<ActiveHoverPreview | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<ActiveHoverPreview | null>(null);

  const handleMouseEnter = (e: React.MouseEvent, info: ImageHoverInfo) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    pendingRef.current = {
      ...info,
      x: e.clientX,
      y: e.clientY,
    };
    timeoutRef.current = setTimeout(() => {
      if (pendingRef.current) {
        setActivePreview(pendingRef.current);
      }
    }, delay);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (pendingRef.current) {
      pendingRef.current.x = e.clientX;
      pendingRef.current.y = e.clientY;
    }
    setActivePreview((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingRef.current = null;
    setActivePreview(null);
  };

  useEffect(() => {
    const handleDismiss = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      pendingRef.current = null;
      setActivePreview(null);
    };

    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    activePreview,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    clearPreview: handleMouseLeave,
  };
}

interface ImageHoverPopupProps {
  preview: ActiveHoverPreview | null;
}

export const ImageHoverPopup: React.FC<ImageHoverPopupProps> = ({ preview }) => {
  if (!preview) return null;

  const isDoubleFaced = Boolean(preview.backImageUrl);
  const popWidth = isDoubleFaced && typeof window !== 'undefined' && window.innerWidth >= 640 ? 530 : 280;
  const popHeight = 392;
  const padding = 16;
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = preview.x + 20;
  if (left + popWidth + padding > winWidth) {
    left = preview.x - popWidth - 20;
  }
  left = Math.max(padding, Math.min(winWidth - popWidth - padding, left));

  let top = preview.y - popHeight / 2;
  top = Math.max(padding, Math.min(winHeight - popHeight - padding, top));

  return (
    <div
      className="pointer-events-none fixed z-[9999] transition-opacity duration-150 shadow-2xl rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950/95 backdrop-blur-md p-1.5 animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {isDoubleFaced ? (
        <div className="flex gap-2">
          <div className="relative">
            <img
              src={preview.imageUrl}
              alt={preview.name || 'Card front'}
              className="w-[250px] h-auto rounded-xl object-contain shadow-xl"
              loading="eager"
              referrerPolicy="no-referrer"
              onError={(e) => {
                if (preview.fallbackUrl && e.currentTarget.src !== preview.fallbackUrl) {
                  e.currentTarget.src = preview.fallbackUrl;
                }
              }}
            />
            <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 text-[10px] text-slate-300 font-medium">
              Front
            </span>
          </div>
          <div className="relative">
            <img
              src={preview.backImageUrl}
              alt={`${preview.name || 'Card'} (Back)`}
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
        <div className="relative">
          <img
            src={preview.imageUrl}
            alt={preview.name || 'Card preview'}
            className="w-[280px] h-auto rounded-xl object-contain shadow-xl"
            loading="eager"
            referrerPolicy="no-referrer"
            onError={(e) => {
              if (preview.fallbackUrl && e.currentTarget.src !== preview.fallbackUrl) {
                e.currentTarget.src = preview.fallbackUrl;
              } else if (preview.scryfallId && !e.currentTarget.src.includes('format=image')) {
                e.currentTarget.src = `https://api.scryfall.com/cards/${preview.scryfallId}?format=image&version=large`;
              }
            }}
          />
          {preview.name && (
            <div className="mt-1 px-2 py-0.5 text-center text-xs font-semibold text-slate-300 truncate max-w-[280px]">
              {preview.name}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
