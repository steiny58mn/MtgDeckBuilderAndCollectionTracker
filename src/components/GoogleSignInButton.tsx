import React, { useEffect, useRef, useState } from 'react';
import { AuthService, UserDto } from '../services/authService';
import { GOOGLE_CLIENT_ID } from '../config/apiConfig';

interface GoogleSignInButtonProps {
  onSuccess: (user: UserDto) => void;
  onError?: (errorMsg: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  theme?: 'outline' | 'filled_black' | 'filled_blue';
  width?: string | number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
        };
      };
    };
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onError,
  text = 'continue_with',
  theme = 'filled_black',
  width = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== 'undefined' && !!window.google?.accounts?.id
  );

  const clientId = GOOGLE_CLIENT_ID;

  // Ensure Google Identity Services script is loaded
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.google?.accounts?.id) {
        setScriptLoaded(true);
        clearInterval(checkInterval);
      }
    }, 100);

    const timer = setTimeout(() => {
      clearInterval(checkInterval);
    }, 5000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timer);
    };
  }, []);

  // Initialize and render Google button
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !clientId) return;

    try {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response?.credential) {
            onError?.('No credential returned by Google.');
            return;
          }

          setIsLoading(true);
          try {
            const result = await AuthService.loginWithGoogle(response.credential);
            if (result.success && result.user) {
              onSuccess(result.user);
            } else {
              onError?.(result.message || 'Google authentication failed.');
            }
          } catch (err: any) {
            console.error('[GoogleSignInButton] Login error:', err);
            onError?.(err?.message || 'Could not communicate with authentication server.');
          } finally {
            setIsLoading(false);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear previous button child nodes if re-rendering
      containerRef.current.innerHTML = '';

      window.google?.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: theme,
        size: 'large',
        text: text,
        shape: 'rectangular',
        logo_alignment: 'left',
        width: typeof width === 'number' ? width : undefined,
      });
    } catch (e: any) {
      console.error('[GoogleSignInButton] Failed to render Google button:', e);
    }
  }, [scriptLoaded, clientId, text, theme, width, onSuccess, onError]);

  if (!clientId) {
    return (
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs text-center">
        <span className="font-semibold">Google Sign-In:</span> Set <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-200">VITE_GOOGLE_CLIENT_ID</code> in <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-200">.env</code> to activate.
      </div>
    );
  }

  return (
    <div className="relative w-full flex flex-col items-center">
      <div
        ref={containerRef}
        className="w-full flex justify-center [&>div]:!w-full [&>div>iframe]:!w-full min-h-[44px]"
      />
      {isLoading && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center rounded-xl z-10">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
          <span className="text-xs text-indigo-300 font-medium">Verifying Google account...</span>
        </div>
      )}
    </div>
  );
};
