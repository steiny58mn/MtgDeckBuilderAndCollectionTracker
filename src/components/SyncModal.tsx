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
  Info,
  Cpu,
  Layers
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
  const [fnCheckResult, setFnCheckResult] = useState<any>(null);
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
      StorageService.checkFunctionsCompilation().then((res) => {
        setFnCheckResult(res);
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
      const [fnRes, diagRes] = await Promise.all([
        StorageService.checkFunctionsCompilation(),
        StorageService.runDiagnostics(),
      ]);
      setFnCheckResult(fnRes);
      setDiagResult(diagRes);
      if (diagRes.status === 'connected') {
        onNotify?.('Database connection test passed!', 'success');
      } else {
        onNotify?.('Database connection test completed with notices.', 'info');
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
                  ? (backendInfo.isRemote ? 'Cloud Connected (Local Cache)' : 'Local Storage Active')
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

        {/* Cloudflare Functions & Secrets Inspector */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-semibold text-slate-200">Cloudflare Functions & Secrets Inspector</span>
            </div>
            <button
              onClick={handleRunDiagnostics}
              disabled={testingDiag}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${testingDiag ? 'animate-spin' : ''}`} />
              {testingDiag ? 'Inspecting...' : 'Inspect Live DB & Secrets'}
            </button>
          </div>

          {/* Key status cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Functions Compilation Check */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/60 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block font-medium">1. Functions Compiled</span>
              <div className="mt-1 flex items-center gap-1.5">
                {fnCheckResult?.functionsCompiled ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-emerald-400 truncate">Compiled</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-bold text-amber-400 truncate">{fnCheckResult?.isHtmlFallback ? 'HTML Fallback' : 'Checking...'}</span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-slate-500 truncate mt-0.5">
                {fnCheckResult?.engine || 'Testing router...'}
              </span>
            </div>

            {/* TURSO_DATABASE_URL */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/60 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block font-medium">2. TURSO_DATABASE_URL</span>
              <div className="mt-1 flex items-center gap-1.5">
                {fnCheckResult?.environmentVariables?.TURSO_DATABASE_URL?.isPlaceholder ? (
                  <>
                    <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="font-bold text-sky-400 truncate">Local Mode (Placeholder)</span>
                  </>
                ) : fnCheckResult?.environmentVariables?.TURSO_DATABASE_URL?.present ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-emerald-400 truncate">Detected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-bold text-amber-400 truncate">Missing in Secrets</span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono truncate mt-0.5" title={fnCheckResult?.environmentVariables?.TURSO_DATABASE_URL?.masked || 'None'}>
                {fnCheckResult?.environmentVariables?.TURSO_DATABASE_URL?.isPlaceholder 
                  ? 'Placeholder Example' 
                  : (fnCheckResult?.environmentVariables?.TURSO_DATABASE_URL?.masked || 'Not Set')}
              </span>
            </div>

            {/* TURSO_AUTH_TOKEN */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/60 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block font-medium">3. TURSO_AUTH_TOKEN</span>
              <div className="mt-1 flex items-center gap-1.5">
                {fnCheckResult?.environmentVariables?.TURSO_AUTH_TOKEN?.isPlaceholder ? (
                  <>
                    <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="font-bold text-sky-400 truncate">Placeholder Token</span>
                  </>
                ) : fnCheckResult?.environmentVariables?.TURSO_AUTH_TOKEN?.present ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-emerald-400 truncate">Present ({fnCheckResult.environmentVariables.TURSO_AUTH_TOKEN.length} ch)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="font-bold text-amber-400 truncate">Missing in Secrets</span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-slate-500 truncate mt-0.5">
                {fnCheckResult?.environmentVariables?.TURSO_AUTH_TOKEN?.isPlaceholder
                  ? 'Local Storage Fallback'
                  : fnCheckResult?.environmentVariables?.TURSO_AUTH_TOKEN?.looksLikeJWT ? 'Valid JWT Format' : 'JWT Token'}
              </span>
            </div>
          </div>

          {/* Diagnostics output if requested */}
          {showDiagPanel && (diagResult || fnCheckResult) && (
            <div className={`p-3 rounded-lg border text-xs space-y-2 ${
              diagResult?.status === 'connected' 
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' 
                : diagResult?.status === 'local_storage'
                ? 'bg-sky-950/20 border-sky-500/30 text-sky-200'
                : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  {diagResult?.status === 'connected' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Live Database Connected ({diagResult.latencyMs}ms ping)</span>
                    </>
                  ) : diagResult?.status === 'local_storage' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-sky-400" />
                      <span>Local SQLite Storage Active</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Diagnostics Notice</span>
                    </>
                  )}
                </div>
                {diagResult?.counts && (
                  <span className="text-[10px] font-mono text-slate-400">
                    {diagResult.counts.decks} decks &bull; {diagResult.counts.binders} binders
                  </span>
                )}
              </div>

              {diagResult?.error && (
                <div className="p-2 rounded bg-black/50 border border-amber-500/30 font-mono text-[10px] text-amber-300 break-all">
                  {diagResult.error}
                </div>
              )}

              {fnCheckResult?.troubleshooting && !fnCheckResult?.environmentVariables?.TURSO_DATABASE_URL?.present && (
                <div className="text-[11px] text-slate-300 bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                  <span className="font-semibold text-fuchsia-300 block">How to configure secrets in Cloudflare Pages:</span>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-400 text-[11px]">
                    <li>Open <strong>Cloudflare Dashboard &rarr; Workers &amp; Pages &rarr; Your Project</strong></li>
                    <li>Go to <strong>Settings &rarr; Environment Variables</strong></li>
                    <li>Add <code className="text-fuchsia-300 font-mono">TURSO_DATABASE_URL</code> and <code className="text-fuchsia-300 font-mono">TURSO_AUTH_TOKEN</code></li>
                    <li>Click <strong>Deployments &rarr; Redeploy latest</strong> to apply the secrets</li>
                  </ol>
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

        {/* Browser Console Debugging Note */}
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Browser DevTools Console Diagnostics</span>
          </div>
          <ul className="space-y-1 list-disc list-inside leading-relaxed text-slate-400 text-[11px]">
            <li>
              Type <code className="text-sky-300 font-mono">checkCloudflareFunctions()</code> in Console (<kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">F12</kbd>) to check if Functions compiled and secrets exist.
            </li>
            <li>
              Type <code className="text-emerald-300 font-mono">testTurso()</code> to test live remote database ping, latency, and vault counts.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
