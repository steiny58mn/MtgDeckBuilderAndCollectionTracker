/**
 * Viewport Scroll Utilities
 * Reliably resets scroll position to the top of the screen when navigating
 * between views, entering a deck, or opening a binder, or smooth scrolling to top.
 */

export function scrollToTop(options?: { smooth?: boolean }): void {
  if (typeof window === 'undefined') return;

  const isSmooth = Boolean(options?.smooth);
  const behavior: ScrollBehavior = isSmooth ? 'smooth' : ('instant' as ScrollBehavior);

  const performScroll = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }

    if (document.documentElement) {
      if (isSmooth) {
        try {
          document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } catch {
          document.documentElement.scrollTop = 0;
        }
      } else {
        document.documentElement.scrollTop = 0;
      }
    }
    if (document.body) {
      if (isSmooth) {
        try {
          document.body.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } catch {
          document.body.scrollTop = 0;
        }
      } else {
        document.body.scrollTop = 0;
      }
    }

    const main = document.querySelector('main');
    if (main) {
      if (isSmooth) {
        try {
          main.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } catch {
          main.scrollTop = 0;
        }
      } else {
        main.scrollTop = 0;
      }
    }

    const root = document.getElementById('root');
    if (root) {
      if (isSmooth) {
        try {
          root.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } catch {
          root.scrollTop = 0;
        }
      } else {
        root.scrollTop = 0;
      }
    }
  };

  performScroll();
  if (!isSmooth && typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(performScroll);
  }
}
