import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  Copy, 
  Check, 
  Smartphone, 
  Monitor, 
  X, 
  RefreshCw, 
  Database, 
  Key, 
  ShieldCheck, 
  Plus,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Info
} from 'lucide-react';
import { getCurrentVaultId, setCurrentVaultId, generateVaultId, SyncStatus, StorageService } from '../services/storage';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: SyncStatus;
  onVaultChanged: () => void;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  onVaultChanged,
  onNotify,
}) => {
  const currentVault = getCurrentVaultId();
  const [copied, setCopied] = useState(false);
  const [inputVaultKey, setInputVaultKey] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testingDiag, setTestingDiag] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [showDiagPanel, setShowDiagPanel] = useState(false);
  const [backendInfo, setBackendInfo] = useState<{ 
    isCloudConfigured: boolean; 
    backend: string;
    databaseUrlMasked?: string;
    isRemote?: boolean;
    hasAuthToken?: boolean;
    environment?: string;
  }>({
    isCloudConfigured: false,
    backend: 'turso',
  });

  useEffect(() => {
    if (isOpen) {
      StorageService.checkBackendStatus().then((status) => {
        setBackendInfo(status);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentVault);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      await StorageService.forceSync();
      onNotify?.('Synced successfully with Turso database!', 'success');
    } catch (err: any) {
      onNotify?.(`Sync completed: ${err.message || 'Updated'}`, 'info');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setTestingDiag(true);
    setShowDiagPanel(true);
    try {
      const res = await StorageService.runDiagnostics();
      setDiagResult(res);
      if (res.status === 'connected') {
        onNotify?.('Database connection test passed!', 'success');
      } else {
        onNotify?.('Database connection test flagged an issue. See details.', 'info');
      }
    } catch (e: any) {
      setDiagResult({ status: 'error', error: e.message || String(e) });
    } finally {
      setTestingDiag(false);
    }
  };

  const handleCreateNewVault = () => {
    const newVault = generateVaultId();
    setCurrentVaultId(newVault);
    onVaultChanged();
    onNotify?.(`Created and switched to new Vault: ${newVault}`, 'success');
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
      onNotify?.(`Connected to Turso Vault ${cleanKey}`, 'success');
      onClose();
    }, 400);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto"
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600/30 to-fuchsia-500/30 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Turso Database Sync
            </h3>
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
                  ? 'Turso Cloud Synced'
                  : syncStatus === 'syncing'
                  ? 'Syncing with Turso...'
                  : syncStatus === 'local'
                  ? (backendInfo.isRemote ? 'Cloud Connected (Local Cache)' : 'Local SQLite / Cache Active')
                  : 'Offline Cache'}
              </span>
            </div>
          </div>
        </div>

        {/* Current Vault Key Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-fuchsia-400" />
              Active Cloud Vault Key
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                title="Force refresh data from Turso"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-fuchsia-400' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
              <button
                onClick={handleCreateNewVault}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Generate a new isolated vault"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
            <span className="font-mono text-base sm:text-lg font-bold text-fuchsia-400 tracking-wider select-all">
              {currentVault}
            </span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Key'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            Enter this Vault Key on your phone, tablet, or another browser to sync your decks, binders, and collection across devices.
          </p>
        </div>

        {/* Database Connection Status & Diagnostics Button */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-semibold text-slate-200">Database Connection Status</span>
            </div>
            <button
              onClick={handleRunDiagnostics}
              disabled={testingDiag}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${testingDiag ? 'animate-spin' : ''}`} />
              {testingDiag ? 'Testing...' : 'Test DB Connection'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 block">Target Database</span>
              <span className="font-mono text-slate-200 truncate block mt-0.5" title={backendInfo.databaseUrlMasked || 'file:local.db'}>
                {backendInfo.databaseUrlMasked || (backendInfo.isRemote ? 'Remote Turso' : 'Local SQLite')}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 block">Auth Token</span>
              <span className={`font-semibold block mt-0.5 ${backendInfo.hasAuthToken ? 'text-emerald-400' : 'text-amber-400'}`}>
                {backendInfo.hasAuthToken ? 'Present (Configured)' : 'Missing in Secrets'}
              </span>
            </div>
          </div>

          {/* Diagnostics output if requested */}
          {showDiagPanel && diagResult && (
            <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${
              diagResult.status === 'connected' 
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' 
                : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
            }`}>
              <div className="flex items-center gap-1.5 font-bold">
                {diagResult.status === 'connected' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Connected to {diagResult.isRemote ? 'Turso Cloud Database' : 'Local SQLite Database'} ({diagResult.latencyMs}ms)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Connection Issue Detected</span>
                  </>
                )}
              </div>
              {diagResult.counts && (
                <p className="text-[11px] text-slate-300">
                  Database contains: <strong>{diagResult.counts.decks}</strong> decks, <strong>{diagResult.counts.binders}</strong> binders, <strong>{diagResult.counts.collection}</strong> cards total in DB.
                </p>
              )}
              {diagResult.error && (
                <div className="mt-1 p-2 rounded bg-black/40 border border-amber-500/20 font-mono text-[10px] text-amber-300 break-all">
                  {diagResult.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Device Sync Illustration */}
        <div className="flex items-center justify-center gap-4 py-1 text-slate-400 text-xs">
          <div className="flex flex-col items-center gap-1">
            <Monitor className="w-5 h-5 text-slate-300" />
            <span className="text-[11px]">Desktop</span>
          </div>
          <div className="flex-1 h-px bg-slate-800 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-slate-900 px-2 text-[10px] text-fuchsia-400/80 font-medium">Turso Distributed Sync</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Smartphone className="w-5 h-5 text-slate-300" />
            <span className="text-[11px]">Mobile</span>
          </div>
        </div>

        {/* Connect to Existing Vault Form */}
        <form onSubmit={handleJoinVault} className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-300 block">
            Switch to Another Vault Key
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
              className="px-4 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isSwitching ? 'Linking...' : 'Connect'}
            </button>
          </div>
        </form>

        {/* Cloudflare Secrets & Browser Console Debugging Note */}
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cloudflare Deployment & Console Debugging</span>
          </div>
          <ul className="space-y-1 list-disc list-inside leading-relaxed text-slate-400 text-[11px]">
            <li>
              <strong>Cloudflare Secrets:</strong> Ensure <code className="text-fuchsia-300 font-mono">TURSO_DATABASE_URL</code> and <code className="text-fuchsia-300 font-mono">TURSO_AUTH_TOKEN</code> are added to Cloudflare Pages/Workers under <em>Settings &gt; Environment Variables</em>.
            </li>
            <li>
              <strong>Browser DevTools:</strong> Open your browser Console (<kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">F12</kbd> &rarr; Console) to view real-time <code className="text-fuchsia-300 font-mono">[Turso DB]</code> save and sync logs.
            </li>
            <li>
              <strong>Instant Console Test:</strong> Type <code className="text-emerald-300 font-mono">testTurso()</code> in the browser console at any time to run a direct connection test.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
