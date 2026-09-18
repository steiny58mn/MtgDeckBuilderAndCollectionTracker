import React, { useState, useEffect } from 'react';
import { Database, X, RefreshCw, Server, ShieldCheck, Activity } from 'lucide-react';
import { SyncStatus, StorageService } from '../services/storage';
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
  onOpenDiagnostics,
  onNotify,
}) => {
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

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await StorageService.syncWithRemote();
      await checkTursoHealth();
      onNotify?.('Synchronized with mtgappsapi.azurewebsites.net.', 'success');
    } catch (e: any) {
      onNotify?.('Sync error: ' + (e.message || 'Check connection'), 'info');
    } finally {
      setIsSyncing(false);
    }
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
            <h3 className="text-lg font-bold text-white">Remote C# Backend</h3>
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
                  ? 'Connected & Synced'
                  : syncStatus === 'syncing'
                  ? 'Syncing with API...'
                  : 'Connection Error'}
              </span>
            </div>
          </div>
        </div>

        {/* Turso Service Info Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-fuchsia-400" />
              <span className="text-xs font-bold text-slate-200">Backend API & Database Status</span>
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
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Server</span>
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
            {isSyncing ? 'Syncing...' : 'Sync with Server Now'}
          </button>
        </div>
      </div>
    </div>
  );
};
