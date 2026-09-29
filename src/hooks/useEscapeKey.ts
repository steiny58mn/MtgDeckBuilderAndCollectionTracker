import { useEffect } from 'react';

/**
 * Listens for the Escape key to close a modal or overlay when active.
 */
export function useEscapeKey(isActive: boolean, onEscape?: () => void) {
  useEffect(() => {
    if (!isActive || !onEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);
}
