/**
 * Viewport Scroll Utilities
 * Reliably resets scroll position to the top of the screen when navigating
 * between views, entering a deck, or opening a binder.
 */

export function scrollToTop(): void {
  if (typeof window === 'undefined') return;

  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  } catch {
    window.scrollTo(0, 0);
  }

  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }
  if (document.body) {
    document.body.scrollTop = 0;
  }
}
