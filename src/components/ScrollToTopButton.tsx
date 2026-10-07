import React, { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';
import { scrollToTop } from '../utils/scrollUtils';

interface ScrollToTopButtonProps {
  threshold?: number;
  className?: string;
  label?: string;
}

export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  threshold = 200,
  className = '',
  label = 'Top',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        document.querySelector('main')?.scrollTop ||
        0;
      setIsVisible(scrollY > threshold);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    const main = document.querySelector('main');
    if (main) main.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (main) main.removeEventListener('scroll', handleScroll);
    };
  }, [threshold]);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={() => scrollToTop({ smooth: true })}
      className={`fixed bottom-6 right-6 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 shadow-2xl shadow-black/80 backdrop-blur-md text-xs font-bold transition-all cursor-pointer active:scale-95 ${className}`}
      title="Go to top of screen"
    >
      <ChevronUp className="w-4 h-4 text-violet-400" />
      <span>{label}</span>
    </button>
  );
};
