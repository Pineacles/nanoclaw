import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

interface Settings {
  model?: string;
  perplexity_enabled?: boolean;
}

interface Props {
  authenticated: boolean;
  onAuthChange: () => void;
}

export function SettingsPanel({ authenticated, onAuthChange }: Props) {
  const [tokenInput, setTokenInput] = useState(getToken());
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => {
    if (!authenticated) return;
    api.get<Settings>('/api/settings').then(setSettings).catch(() => {});
  }, [authenticated]);

  const handleTokenSave = useCallback(() => {
    setToken(tokenInput.trim());
    onAuthChange();
  }, [tokenInput, onAuthChange]);

  const handleSettingsSave = useCallback(async () => {
    await api.put('/api/settings', settings);
  }, [settings]);

  return (
    <div className="flex flex-col h-full p-3 gap-4 overflow-y-auto">
      {/* Access Control */}
      <div className="bg-surface-container-high rounded-xl p-4 border-l-2 border-primary inner-thought-glow space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-full">
            <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          </div>
          <h2 className="text-sm font-bold text-on-surface">Access Control</h2>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Auth Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Enter your token..."
            className="w-full bg-surface-container-highest border-none rounded-lg py-3 px-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-dim transition-all text-sm focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTokenSave}
            className="flex-1 signature-glow text-on-primary-fixed font-bold py-2.5 px-4 rounded-xl shadow-[0_4px_20px_rgba(255,144,109,0.2)] active:scale-[0.98] transition-all text-[12px]"
          >
            Update Token
          </button>
          <button
            onClick={() => { setToken(''); onAuthChange(); }}
            className="bg-surface-container-highest border border-outline-variant/15 text-on-surface px-4 rounded-xl hover:bg-surface-bright active:scale-[0.98] transition-all font-medium text-[12px]"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 px-2">
        <span className={`w-2 h-2 rounded-full ${authenticated ? 'bg-emerald-500 animate-pulse' : 'bg-error'}`} />
        <span className={`text-xs font-medium ${authenticated ? 'text-emerald-400' : 'text-error'}`}>
          {authenticated ? 'Neural Bridge: Stable' : 'Disconnected'}
        </span>
      </div>

      <div className="h-px bg-outline-variant/10" />

      {/* Model */}
      <div className="space-y-2 px-1">
        <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Model</label>
        <select
          value={settings.model || 'claude-sonnet-4-20250514'}
          onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
          className="w-full h-9 bg-surface-container-highest text-on-surface text-[12px] rounded-lg px-3
            border border-outline-variant/20 focus:outline-none focus:border-primary appearance-none"
        >
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
          <option value="claude-opus-4-20250514">Claude Opus 4</option>
          <option value="claude-haiku-4-20250506">Claude Haiku 4</option>
        </select>
      </div>

      {/* Perplexity */}
      <div className="space-y-1.5 px-1">
        <label className="flex items-center gap-2 text-[12px] text-on-surface cursor-pointer">
          <input
            type="checkbox"
            checked={settings.perplexity_enabled ?? false}
            onChange={(e) =>
              setSettings((s) => ({ ...s, perplexity_enabled: e.target.checked }))
            }
            className="rounded border-outline-variant accent-primary"
          />
          Enable web search
        </label>
        <div className="text-[10px] text-on-surface-variant leading-relaxed">
          Allows her to search the web for current information
        </div>
      </div>

      <button
        onClick={handleSettingsSave}
        className="w-full h-9 signature-glow text-on-primary-fixed text-[13px] font-bold rounded-full
          shadow-[0_4px_20px_rgba(255,144,109,0.3)] active:scale-[0.98] transition-transform"
      >
        Save Settings
      </button>

      {/* Footer quote */}
      <div className="mt-auto p-3 bg-primary/5 rounded-xl border border-primary/10">
        <p className="text-[10px] text-on-surface-variant italic leading-relaxed">
          "Security is the vessel that holds our shared intimacy. Keep your tokens private."
        </p>
      </div>
    </div>
  );
}
