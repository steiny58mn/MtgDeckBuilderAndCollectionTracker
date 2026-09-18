import React, { useState, useEffect } from 'react';
import { Database, Copy, Check, Smartphone, Monitor, X, RefreshCw, Server, ShieldCheck, Activity } from 'lucide-react';
import { getCurrentVaultId, setCurrentVaultId, SyncStatus, StorageService } from '../services/storage';
import { getTursoStatus, TursoStatusResponse, getApiBaseUrl } from '../services/api';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: SyncStatus;
  onVaultChanged: () => void;
  onOpenDiagnostics?: () => void;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  onVaultChanged,
  onOpenDiagnostics,
  onNotify,
}) => {
  const currentVault = getCurrentVaultId();
  const [copied, setCopied] = useState(false);
  const [inputVaultKey, setInputVaultKey] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tursoStatus, setTursoStatus] = useState<TursoStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkTursoHealth();
    }
  }, [isOpen]);

  const checkTursoHealth = async () => {
    setIsLoadingStatus(true);
    try {
      const status = await getTursoStatus();
      setTursoStatus(status);
    } catch (err) {
      console.warn('Failed to get Turso status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentVault);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await StorageService.syncWithTurso();
      await checkTursoHealth();
      onNotify?.('Successfully synchronized with Turso Database.', 'success');
    } catch (e: any) {
      onNotify?.('Sync error: ' + (e.message || 'Check connection'), 'info');
    } finally {
      setIsSyncing(false);
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

  const activeBaseUrl = getApiBaseUrl();

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
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Turso Cloud Database</h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-400'
                    : syncStatus === 'syncing'
                    ? 'bg-fuchsia-400 animate-spin'
                    : 'bg-rose-400'
                }`}
              />
              <span className="capitalize">
                {syncStatus === 'synced'
                  ? 'Connected to Turso DB'
                  : syncStatus === 'syncing'
                  ? 'Syncing with Turso...'
                  : 'Offline Cache Mode'}
              </span>
            </div>
          </div>
        </div>

        {/* Turso Service Info Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-fuchsia-400" />
              <span className="text-xs font-bold text-slate-200">Backend API & Turso Status</span>
            </div>
            <div className="flex items-center gap-2">
              {onOpenDiagnostics && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDiagnostics();
                  }}
                  className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Activity className="w-3 h-3" />
                  Diagnostics
                </button>
              )}
              <button
                onClick={checkTursoHealth}
                disabled={isLoadingStatus}
                className="text-[11px] text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Target API</span>
              <span className="text-slate-300 font-mono text-[11px] truncate block" title={activeBaseUrl || '(relative)'}>
                {activeBaseUrl || '(relative proxy)'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Turso DB</span>
              <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Active
              </span>
            </div>
          </div>

          {tursoStatus && (
            <div className="text-[11px] text-slate-400 space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
              <div className="flex justify-between items-center">
                <span>NexusTools Turso:</span>
                <span className={tursoStatus.nexusTools?.configured ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {tursoStatus.nexusTools?.configured ? 'Configured' : 'Ready'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>DeckBuilder Turso:</span>
                <span className={tursoStatus.deckBuilder?.configured ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {tursoStatus.deckBuilder?.configured ? 'Configured' : 'Ready'}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing with Turso...' : 'Sync with Turso Now'}
          </button>
        </div>

        {/* Current Vault Key Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Your Turso Vault ID
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
            All decks, binders, and collection data are stored under this Vault ID in the Turso database.
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
              <span className="bg-slate-900 px-2 text-[10px] text-fuchsia-400/80">Turso Sync</span>
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
            Connect to Existing Turso Vault
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
