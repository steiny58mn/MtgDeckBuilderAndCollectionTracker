import { useEffect } from 'react';

let lockCount = 0;
let prevBodyOverflow = '';
let prevHtmlOverflow = '';
let prevBodyOverscroll = '';

/**
 * Locks background body and document scrolling when a modal or overlay is open.
 * Uses a reference counter so nested or overlapping modals do not prematurely unlock scrolling.
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    if (lockCount === 0) {
      prevBodyOverflow = document.body.style.overflow;
      prevHtmlOverflow = document.documentElement.style.overflow;
      prevBodyOverscroll = document.body.style.overscrollBehavior;

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'contain';
    }
    lockCount++;

    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.style.overscrollBehavior = prevBodyOverscroll;
      }
    };
  }, [isLocked]);
}
