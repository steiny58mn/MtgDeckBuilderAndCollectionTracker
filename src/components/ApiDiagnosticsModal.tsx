import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Copy, 
  Check, 
  X, 
  Globe, 
  ShieldAlert, 
  Save, 
  RotateCcw
} from 'lucide-react';
import { 
  runFullDiagnostics, 
  DiagnosticResult, 
  getApiBaseUrl, 
  setApiBaseUrl, 
  resetApiBaseUrl 
} from '../services/api';

interface ApiDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
}

export const ApiDiagnosticsModal: React.FC<ApiDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentBaseUrl, setCurrentBaseUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      const active = getApiBaseUrl();
      setCurrentBaseUrl(active);
      setInputUrl(active);
      runDiagnostics(active);
    }
  }, [isOpen]);

  const runDiagnostics = async (baseUrlToTest?: string) => {
    setIsRunning(true);
    try {
      const diagResults = await runFullDiagnostics(baseUrlToTest);
      setResults(diagResults);
    } catch (err) {
      console.error('Diagnostic error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveBaseUrl = () => {
    const trimmed = inputUrl.trim();
    setApiBaseUrl(trimmed);
    const updated = getApiBaseUrl();
    setCurrentBaseUrl(updated);
    onNotify?.(`API Base URL set to: "${updated || '(relative proxy)'}"`, 'success');
    runDiagnostics(updated);
  };

  const handleResetBaseUrl = () => {
    resetApiBaseUrl();
    const updated = getApiBaseUrl();
    setCurrentBaseUrl(updated);
    setInputUrl(updated);
    onNotify?.('Reset API Base URL to default', 'info');
    runDiagnostics(updated);
  };

  const handleUseRelative = () => {
    setInputUrl('');
    setApiBaseUrl('');
    setCurrentBaseUrl('');
    onNotify?.('Switched to relative proxy mode ("")', 'info');
    runDiagnostics('');
  };

  const handleUseLocalhost = () => {
    const localUrl = 'http://localhost:5205';
    setInputUrl(localUrl);
    setApiBaseUrl(localUrl);
    setCurrentBaseUrl(localUrl);
    onNotify?.('Switched to Local C# Debug API (http://localhost:5205)', 'info');
    runDiagnostics(localUrl);
  };

  const handleUseAzure = () => {
    const azureUrl = 'https://mtgappsapi.azurewebsites.net';
    setInputUrl(azureUrl);
    setApiBaseUrl(azureUrl);
    setCurrentBaseUrl(azureUrl);
    onNotify?.('Switched to direct Azure API', 'info');
    runDiagnostics(azureUrl);
  };

  const handleCopyReport = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

    let markdown = `# MTG Deck Builder API Diagnostics Report\n`;
    markdown += `- **Timestamp**: ${new Date().toISOString()}\n`;
    markdown += `- **Client Origin**: ${origin}\n`;
    markdown += `- **API Base URL**: ${currentBaseUrl || '(relative proxy)'}\n`;
    markdown += `- **User Agent**: ${userAgent}\n\n`;
    markdown += `## Test Results\n\n`;

    results.forEach((r, idx) => {
      const icon = r.status === 'success' ? '✅' : r.status === 'cors_error' ? '🚫 CORS' : '❌';
      markdown += `### ${idx + 1}. ${r.name} - ${icon} (${r.durationMs}ms)\n`;
      markdown += `- **URL**: \`${r.targetUrl}\`\n`;
      markdown += `- **Status**: ${r.status}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ''}\n`;
      if (r.errorDetails) markdown += `- **Error**: ${r.errorDetails}\n`;
      if (r.responsePreview) markdown += `- **Response Preview**: \`${r.responsePreview.slice(0, 120)}\`\n`;
      markdown += `\n`;
    });

    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onNotify?.('Diagnostic report copied to clipboard!', 'success');
  };

  const hasCorsError = results.some((r) => r.status === 'cors_error' || r.corsSuspected);
  const hasFailed = results.some((r) => r.status === 'failed' || r.status === 'cors_error' || r.status === 'timeout');
  const allPassed = results.length > 0 && results.every((r) => r.status === 'success');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 flex flex-col gap-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                API Connection Diagnostics
                {isRunning ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 animate-pulse font-mono">
                    Testing...
                  </span>
                ) : allPassed ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                    All Tests Passed
                  </span>
                ) : hasFailed ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-mono">
                    Issues Detected
                  </span>
                ) : null}
              </h2>
              <p className="text-xs text-slate-400">
                Diagnose connectivity between your browser and the local/remote backend
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Main Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Target Base URL Configurator */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-violet-400" />
                Target API Base URL
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleUseLocalhost}
                  className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-fuchsia-700/60 hover:bg-fuchsia-950/40 text-fuchsia-300 font-mono transition-colors cursor-pointer"
                  title="Local C# Debugging (localhost:5205)"
                >
                  Localhost:5205
                </button>
                <button
                  type="button"
                  onClick={handleUseAzure}
                  className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                  title="Direct to Azure Web App"
                >
                  Azure API
                </button>
                <button
                  type="button"
                  onClick={handleUseRelative}
                  className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                  title="Use same-origin relative paths (/mtgtools)"
                >
                  Vite Proxy
                </button>
                <button
                  type="button"
                  onClick={handleResetBaseUrl}
                  className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Reset to build default"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://localhost:5205 or https://mtgappsapi.azurewebsites.net"
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={handleSaveBaseUrl}
                disabled={isRunning}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                Apply & Test
              </button>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>
                Active: <span className="font-mono text-violet-300">{currentBaseUrl || '(relative / Vite dev proxy)'}</span>
              </span>
              <span>
                Origin: <span className="font-mono text-slate-300">{typeof window !== 'undefined' ? window.location.origin : ''}</span>
              </span>
            </div>
          </div>

          {/* CORS Alert & Troubleshooting Advice */}
          {hasCorsError && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                Cross-Origin Resource Sharing (CORS) Block Detected
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                The frontend at <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-300 font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}</code> was blocked by the browser. If running C# locally, enable CORS in <code className="text-amber-300 font-mono">Program.cs</code>:
              </p>
              <div className="text-[11px] bg-slate-950/80 p-3 rounded-lg border border-amber-500/20 font-mono text-slate-300 space-y-1.5">
                <p className="text-amber-400 font-sans font-bold text-xs">C# Local Debug CORS Configuration:</p>
                <p><code>builder.Services.AddCors(options =&gt; options.AddDefaultPolicy(p =&gt; p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));</code></p>
                <p><code>app.UseCors();</code></p>
              </div>
            </div>
          )}

          {/* Test Results Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Endpoint Diagnostic Checks</span>
              <button
                onClick={() => runDiagnostics(currentBaseUrl)}
                disabled={isRunning}
                className="text-violet-400 hover:text-violet-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                Re-run All Checks
              </button>
            </div>

            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.id}
                  className={`p-3 rounded-xl border transition-all text-xs ${
                    r.status === 'success'
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : r.status === 'cors_error'
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : r.status === 'timeout'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {r.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : r.status === 'cors_error' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-100 block truncate">
                          {r.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 truncate block">
                          {r.targetUrl}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-[11px]">
                      {r.httpStatus && (
                        <span
                          className={`font-mono px-2 py-0.5 rounded font-bold ${
                            r.httpStatus >= 200 && r.httpStatus < 300
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          HTTP {r.httpStatus}
                        </span>
                      )}
                      <span className="text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {r.durationMs}ms
                      </span>
                    </div>
                  </div>

                  {r.errorDetails && (
                    <div className="mt-2 text-[11px] text-rose-300/90 bg-rose-950/40 p-2 rounded-lg border border-rose-500/20 font-mono leading-relaxed">
                      {r.errorDetails}
                    </div>
                  )}

                  {r.responsePreview && r.status === 'success' && (
                    <div className="mt-2 text-[10px] text-slate-400 bg-slate-950/80 p-2 rounded-lg border border-slate-800 font-mono truncate">
                      {r.responsePreview}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between shrink-0">
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied Report!' : 'Copy Diagnostic Report'}
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
