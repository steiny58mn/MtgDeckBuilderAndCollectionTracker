import React, { useState } from 'react';
import { Cloud, Copy, Check, Smartphone, Monitor, X, LogIn, LogOut, ShieldCheck, User as UserIcon, Loader2 } from 'lucide-react';
import { User } from 'firebase/auth';
import { getCurrentVaultId, setCurrentVaultId, SyncStatus } from '../services/storage';
import { signInWithGoogle, signOutUser } from '../lib/firebase';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: SyncStatus;
  currentUser: User | null;
  onVaultChanged: () => void;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  currentUser,
  onVaultChanged,
  onNotify,
}) => {
  const currentVault = getCurrentVaultId();
  const [copied, setCopied] = useState(false);
  const [inputVaultKey, setInputVaultKey] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentVault);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignIn = async () => {
    try {
      setIsAuthLoading(true);
      setAuthError(null);
      const user = await signInWithGoogle();
      onNotify?.(`Welcome back, ${user.displayName || user.email || 'Planeswalker'}! Cloud sync activated.`, 'success');
    } catch (err: unknown) {
      console.warn('Google sign-in cancelled or error:', err);
      const message = err instanceof Error ? err.message : 'Sign-in cancelled';
      // Only set error if not a user cancellation popup-closed
      if (!message.includes('popup-closed-by-user') && !message.includes('cancelled-popup-request')) {
        setAuthError('Sign-in could not be completed. Please try again.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsAuthLoading(true);
      await signOutUser();
      onNotify?.('Signed out. Switched to local browser storage mode.', 'info');
    } catch (err) {
      console.warn('Sign-out error:', err);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleJoinVault = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = inputVaultKey.trim().toUpperCase();
    if (!cleanKey || cleanKey === currentVault) return;

    setIsSwitching(true);
    setCurrentVaultId(cleanKey);
    setTimeout(() => {
      setIsSwitching(false);
      onVaultChanged();
      onNotify?.(`Connected to Vault ${cleanKey}`, 'success');
      onClose();
    }, 500);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Cross-Device Cloud Sync</h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-400 animate-pulse'
                    : syncStatus === 'syncing'
                    ? 'bg-fuchsia-400 animate-spin'
                    : syncStatus === 'local'
                    ? 'bg-sky-400'
                    : 'bg-slate-500'
                }`}
              />
              <span className="capitalize">
                {syncStatus === 'synced'
                  ? 'Cloud Synced (Firestore)'
                  : syncStatus === 'syncing'
                  ? 'Syncing with Cloud...'
                  : syncStatus === 'local'
                  ? 'Local Storage Mode'
                  : 'Offline Cache'}
              </span>
            </div>
          </div>
        </div>

        {/* User Account / Sign In Section */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          {currentUser ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="w-10 h-10 rounded-full border border-slate-700 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center border border-fuchsia-500/30 shrink-0">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {currentUser.displayName || 'Authenticated User'}
                    </p>
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                disabled={isAuthLoading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isAuthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Sign Out
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center shrink-0 mt-0.5">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Sync with Google Account</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    Sign in to securely back up your decks and collection to Cloud Firestore and sync across all your devices.
                  </p>
                </div>
              </div>

              {authError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
                  {authError}
                </p>
              )}

              <button
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isAuthLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                Sign In with Google
              </button>
            </div>
          )}
        </div>

        {/* Current Vault Key Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Your Cloud Vault Key
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold text-fuchsia-400 tracking-wider">
              {currentVault}
            </span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-normal pt-1">
            Use this vault key on your phone, tablet, or another browser to sync your decks and collection.
          </p>
        </div>

        {/* Device Sync Illustration */}
        <div className="flex items-center justify-center gap-4 py-1 text-slate-400 text-xs">
          <div className="flex flex-col items-center gap-1">
            <Monitor className="w-5 h-5 text-slate-300" />
            <span className="text-[11px]">Desktop</span>
          </div>
          <div className="flex-1 h-px bg-slate-800 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-slate-900 px-2 text-[10px] text-fuchsia-400/80">Real-Time Sync</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Smartphone className="w-5 h-5 text-slate-300" />
            <span className="text-[11px]">Mobile</span>
          </div>
        </div>

        {/* Connect to Existing Vault */}
        <form onSubmit={handleJoinVault} className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-300 block">
            Connect to Existing Vault
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputVaultKey}
              onChange={(e) => setInputVaultKey(e.target.value)}
              placeholder="e.g. MTG-7K9P-2X4M"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-fuchsia-500"
            />
            <button
              type="submit"
              disabled={!inputVaultKey.trim() || isSwitching}
              className="px-4 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSwitching ? 'Linking...' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
