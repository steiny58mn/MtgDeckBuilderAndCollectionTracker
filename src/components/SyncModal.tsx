import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Key,
  Copy,
  Check,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  Globe,
  HardDrive,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  StorageService,
  SyncStatus,
  getCurrentVaultId,
  setCurrentVaultId,
  generateVaultId,
  getRemoteApiUrl,
  setRemoteApiUrl,
} from '../services/storage';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: SyncStatus;
  onVaultChanged: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  onVaultChanged,
  onNotify,
}) => {
  const [currentVault, setCurrentVault] = useState(getCurrentVaultId());
  const [inputVaultKey, setInputVaultKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // Diagnostics & Connection testing
  const [apiUrl, setApiUrl] = useState(getRemoteApiUrl());
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<{
    status: 'connected' | 'warning' | 'unreachable' | 'local_only';
    latencyMs: number;
    httpStatus?: number;
    targetUrl: string;
    details?: any;
    error?: string;
  } | null>(null);

  // Storage metrics
  const [storageStats, setStorageStats] = useState(StorageService.getStorageDiagnostics());

  useEffect(() => {
    if (isOpen) {
      const v = getCurrentVaultId();
      setCurrentVault(v);
      setApiUrl(getRemoteApiUrl());
      setStorageStats(StorageService.getStorageDiagnostics());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentVault);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateNewVault = () => {
    const newVault = generateVaultId();
    setCurrentVaultId(newVault);
    setCurrentVault(newVault);
    onVaultChanged();
    setStorageStats(StorageService.getStorageDiagnostics());
    onNotify?.(`Created new Vault: ${newVault}`, 'success');
  };

  const handleJoinVault = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = inputVaultKey.trim().toUpperCase();
    if (!cleanKey || cleanKey === currentVault) return;

    setIsSwitching(true);
    setCurrentVaultId(cleanKey);
    setCurrentVault(cleanKey);
    setTimeout(() => {
      setIsSwitching(false);
      onVaultChanged();
      setStorageStats(StorageService.getStorageDiagnostics());
      onNotify?.(`Switched to Vault ${cleanKey}`, 'success');
      onClose();
    }, 300);
  };

  const handleTestConnection = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsTestingConn(true);
    try {
      setRemoteApiUrl(apiUrl);
      const res = await StorageService.testConnection(apiUrl);
      setConnResult(res);
      if (res.status === 'connected') {
        onNotify?.(`Database connection verified! (${res.latencyMs}ms)`, 'success');
      } else if (res.status === 'warning') {
        onNotify?.(`Endpoint responded with HTTP ${res.httpStatus}`, 'info');
      } else if (res.status === 'local_only') {
        onNotify?.('Client-side storage active.', 'info');
      } else {
        onNotify?.(`Connection failed: ${res.error || 'Unreachable'}`, 'error');
      }
    } catch (err: any) {
      setConnResult({
        status: 'unreachable',
        latencyMs: 0,
        targetUrl: apiUrl,
        error: err.message || 'Failed to ping target URL',
      });
    } finally {
      setIsTestingConn(false);
      setStorageStats(StorageService.getStorageDiagnostics());
    }
  };

  const handleExportBackup = () => {
    const jsonStr = StorageService.exportVaultJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtg-vault-${currentVault}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify?.('Vault backup exported successfully!', 'success');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = StorageService.importVaultJson(content);
      if (res.success) {
        setCurrentVault(getCurrentVaultId());
        setStorageStats(StorageService.getStorageDiagnostics());
        onVaultChanged();
        onNotify?.(res.message, 'success');
      } else {
        onNotify?.(`Import failed: ${res.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto"
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-fuchsia-600/30 to-violet-500/30 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Storage &amp; Database Connection Hub
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-400'
                    : syncStatus === 'syncing'
                    ? 'bg-fuchsia-400 animate-spin'
                    : 'bg-sky-400'
                }`}
              />
              <span>
                {syncStatus === 'synced'
                  ? 'Remote Database Synchronized'
                  : syncStatus === 'syncing'
                  ? 'Verifying Connection...'
                  : 'Client-Side Storage Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Current Vault Key Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-fuchsia-400" />
              Active Vault Identifier
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCreateNewVault}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Generate a new isolated vault"
              >
                <Plus className="w-3 h-3" />
                New Vault
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

          {/* Local Storage Stats */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Decks</span>
              <span className="text-sm font-bold text-slate-200">{storageStats.counts.decks}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Binders</span>
              <span className="text-sm font-bold text-slate-200">{storageStats.counts.binders}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Collection</span>
              <span className="text-sm font-bold text-slate-200">{storageStats.counts.collectionCards}</span>
            </div>
          </div>
        </div>

        {/* Database & API Connection Diagnostics Panel */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold text-slate-200">
                Database / API Connection Diagnostics
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-800 border border-slate-700 text-slate-300">
              Connection Debugger
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            Verify connectivity to your backend API solution (such as your multi-database{' '}
            <code className="text-fuchsia-300 font-mono">MtgToolsForMtgNexus</code> API or any database endpoint).
          </p>

          <form onSubmit={handleTestConnection} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="e.g. http://localhost:5000 or https://api.mtgnexus.com"
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={isTestingConn}
                className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${isTestingConn ? 'animate-spin' : ''}`} />
                {isTestingConn ? 'Pinging...' : 'Test Connection'}
              </button>
            </div>
          </form>

          {/* Connection Test Diagnostics Result */}
          {connResult && (
            <div
              className={`p-3 rounded-lg border text-xs space-y-2 ${
                connResult.status === 'connected'
                  ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                  : connResult.status === 'warning'
                  ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                  : connResult.status === 'local_only'
                  ? 'bg-slate-900 border-slate-800 text-slate-300'
                  : 'bg-rose-950/20 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  {connResult.status === 'connected' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Connection Established ({connResult.latencyMs}ms ping)</span>
                    </>
                  ) : connResult.status === 'warning' ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Responded with HTTP {connResult.httpStatus}</span>
                    </>
                  ) : connResult.status === 'local_only' ? (
                    <>
                      <HardDrive className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>Client Local Storage Active</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Endpoint Unreachable</span>
                    </>
                  )}
                </div>
                {connResult.httpStatus && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-slate-800">
                    HTTP {connResult.httpStatus}
                  </span>
                )}
              </div>

              {connResult.targetUrl && (
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  Target: {connResult.targetUrl}
                </div>
              )}

              {connResult.error && (
                <div className="p-2 rounded bg-black/50 border border-rose-500/30 font-mono text-[10px] text-rose-300 break-all">
                  {connResult.error}
                </div>
              )}

              {connResult.details && (
                <pre className="p-2 rounded bg-black/50 border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                  {typeof connResult.details === 'string'
                    ? connResult.details
                    : JSON.stringify(connResult.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Backup & Restore Vault Data */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-fuchsia-400" />
              Backup &amp; Restore Vault Data
            </span>
            <span className="text-[10px] text-slate-500">Full JSON snapshots</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleExportBackup}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-fuchsia-400" />
              Export Vault JSON
            </button>

            <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              Import Backup
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Switch Vault Form */}
        <form onSubmit={handleJoinVault} className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-300 block">
            Switch to Another Vault Identifier
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
              {isSwitching ? 'Switching...' : 'Switch Vault'}
            </button>
          </div>
        </form>

        {/* Developer Console Diagnostic Quick Command */}
        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            Browser Console Quick Testing
          </div>
          <p className="text-slate-400">
            Open DevTools (<kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">F12</kbd>) and type{' '}
            <code className="text-emerald-300 font-mono">testDbConnection('http://localhost:5000')</code> to test your API or database connectivity anytime.
          </p>
        </div>
      </div>
    </div>
  );
};
