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

const FEATURE_TOGGLES: { key: string; label: string; desc: string }[] = [
  { key: 'memory', label: 'Memory', desc: 'Save and recall memories from conversations' },
  { key: 'diary', label: 'Diary', desc: 'Nightly diary entries and weekly reflections' },
  { key: 'mood', label: 'Mood System', desc: 'Mood tags, schedule, behaviors, and style' },
  { key: 'emotional_state', label: 'Emotional State', desc: 'Auto-generated emotional undercurrent' },
  { key: 'schedule', label: 'Schedule', desc: "User's daily schedule in context" },
  { key: 'personality', label: 'Personality', desc: 'Big Five personality profile and constraints' },
  { key: 'relationship', label: 'Relationship', desc: 'Emotional temperature and dynamics tracking' },
  { key: 'voice_call', label: 'Voice Call', desc: 'Voice calling with the AI assistant' },
];

export function SettingsPage({ authenticated, onAuthChange }: Props) {
  const [tokenInput, setTokenInput] = useState(getToken());
  const [settings, setSettings] = useState<Settings>({});
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [featureHealth, setFeatureHealth] = useState<Record<string, { enabled: boolean; healthy: boolean; missing_tasks?: string[] }>>({});
  const [assistantName, setAssistantName] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!authenticated) return;
    api.get<Settings>('/api/settings').then(setSettings).catch(() => {});
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    api.get<{ features?: Record<string, boolean>; assistant?: { name: string }; user?: { name: string } }>('/api/group-config')
      .then(config => {
        setFeatures(config.features || {});
        setAssistantName(config.assistant?.name || '');
        setUserName(config.user?.name || '');
      })
      .catch(() => {});
    api.get<Record<string, { enabled: boolean; healthy: boolean; missing_tasks?: string[] }>>('/api/feature-health')
      .then(setFeatureHealth)
      .catch(() => {});
  }, [authenticated]);

  const toggleFeature = useCallback(async (key: string) => {
    const updated = { ...features, [key]: !features[key] };
    setFeatures(updated);
    const config = await api.get<Record<string, unknown>>('/api/group-config');
    await api.put('/api/group-config', { ...config, features: updated });
    api.get<Record<string, { enabled: boolean; healthy: boolean; missing_tasks?: string[] }>>('/api/feature-health')
      .then(setFeatureHealth)
      .catch(() => {});
  }, [features]);

  const handleTokenSave = useCallback(() => {
    setToken(tokenInput.trim());
    onAuthChange();
  }, [tokenInput, onAuthChange]);

  const handleSettingsSave = useCallback(async () => {
    await api.put('/api/settings', settings);
  }, [settings]);

  const handleNamesSave = useCallback(async () => {
    const config = await api.get<Record<string, unknown>>('/api/group-config');
    await api.put('/api/group-config', {
      ...config,
      assistant: { ...(config.assistant as Record<string, unknown> || {}), name: assistantName, trigger: `@${assistantName}` },
      user: { ...(config.user as Record<string, unknown> || {}), name: userName },
    });
  }, [assistantName, userName]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-8 md:p-12 max-w-4xl mx-auto w-full space-y-8 sm:space-y-12">
        {/* Hero Header */}
        <section className="space-y-2">
          <h1 className="text-3xl sm:text-5xl font-black text-on-background tracking-tighter">Settings</h1>
          <p className="text-on-surface-variant text-sm sm:text-lg">Calibrate your intimate digital experience.</p>
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-8">
          {/* Authentication Card */}
          <div className="col-span-12 md:col-span-7 bg-surface-container rounded-[1rem] p-6 sm:p-10 inner-thought-glow border-l-4 border-primary">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-primary/20 rounded-full text-primary">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Access Control</h2>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1">Auth Token</label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Enter your authentication token..."
                  className="w-full bg-surface-container-highest border-none rounded-xl py-4 px-6 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-dim transition-all text-lg focus:outline-none"
                />
              </div>
              <div className="flex gap-4 pt-2">
                <button
                  onClick={handleTokenSave}
                  className="flex-grow signature-glow text-on-primary-fixed font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all"
                >
                  Update Token
                </button>
                <button
                  onClick={() => { setToken(''); onAuthChange(); }}
                  className="bg-surface-container-high border border-outline-variant/15 text-on-surface px-8 rounded-xl hover:bg-surface-bright active:scale-[0.98] transition-all font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          {/* Identity Summary Card */}
          <div className="col-span-12 md:col-span-5 bg-surface-container-low rounded-[1rem] p-6 sm:p-10 flex flex-col justify-between overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-4">Connection Status</h3>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-surface-container-highest border border-primary-dim/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-3xl">fingerprint</span>
                </div>
                <div>
                  <p className="font-bold text-on-surface">Private Instance</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full ${authenticated ? 'bg-emerald-500 animate-pulse' : 'bg-error'}`} />
                    <p className={`text-sm ${authenticated ? 'text-emerald-400' : 'text-error'}`}>
                      {authenticated ? 'Neural Bridge: Stable' : 'Not Connected'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative z-10 bg-surface-container-highest/50 p-4 rounded-xl backdrop-blur-sm border border-outline-variant/10">
              <p className="text-xs text-on-surface-variant italic leading-relaxed">
                "Security is the vessel that holds our shared intimacy. Keep your tokens private to maintain the sanctity of this space."
              </p>
            </div>
          </div>

          {/* Identity Card */}
          <div className="col-span-12 bg-surface-container rounded-[1rem] p-6 sm:p-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-primary/20 rounded-full text-primary">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>badge</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Identity</h2>
                <p className="text-on-surface-variant text-sm">Names used throughout the system</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1">Assistant Name</label>
                <input
                  type="text"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  placeholder="e.g. Luna, Claude, Aria..."
                  className="w-full bg-surface-container-highest border-none rounded-xl py-3 px-5 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-dim transition-all focus:outline-none"
                />
                <p className="text-xs text-on-surface-variant ml-1">The AI's display name and trigger word</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1">User Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Michael, Alex..."
                  className="w-full bg-surface-container-highest border-none rounded-xl py-3 px-5 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-dim transition-all focus:outline-none"
                />
                <p className="text-xs text-on-surface-variant ml-1">Your name as referenced by the AI</p>
              </div>
            </div>
            <button
              onClick={handleNamesSave}
              className="mt-6 signature-glow text-on-primary-fixed font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all"
            >
              Save Names
            </button>
          </div>

          {/* Model Selection */}
          <div className="col-span-12 md:col-span-6 bg-surface-container-high rounded-[1rem] p-5 sm:p-8 space-y-6">
            <h3 className="font-bold text-on-surface flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">psychology</span>
              Model
            </h3>
            <div className="space-y-4">
              {[
                { value: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Fast and capable' },
                { value: 'claude-opus-4-20250514', name: 'Claude Opus 4', desc: 'Most intelligent' },
                { value: 'claude-haiku-4-20250506', name: 'Claude Haiku 4', desc: 'Quick and lightweight' },
              ].map((model) => (
                <label
                  key={model.value}
                  className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                    (settings.model || 'claude-sonnet-4-20250514') === model.value
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-surface-container hover:bg-surface-bright border border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.value}
                    checked={(settings.model || 'claude-sonnet-4-20250514') === model.value}
                    onChange={() => setSettings((s) => ({ ...s, model: model.value }))}
                    className="hidden"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    (settings.model || 'claude-sonnet-4-20250514') === model.value
                      ? 'border-primary'
                      : 'border-outline-variant'
                  }`}>
                    {(settings.model || 'claude-sonnet-4-20250514') === model.value && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-on-surface">{model.name}</p>
                    <p className="text-xs text-on-surface-variant">{model.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="col-span-12 md:col-span-6 bg-surface-container rounded-[1rem] p-5 sm:p-8 space-y-6">
            <h3 className="font-bold text-on-surface flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">tune</span>
              Features
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-surface-container-high rounded-xl">
                <div>
                  <span className="text-sm font-medium text-on-surface">Web Search</span>
                  <p className="text-xs text-on-surface-variant mt-0.5">Allow the agent to search the web for current info</p>
                </div>
                <button
                  onClick={() => setSettings((s) => ({ ...s, perplexity_enabled: !s.perplexity_enabled }))}
                  className={`w-12 h-6 rounded-full relative transition-colors ${
                    settings.perplexity_enabled ? 'bg-primary' : 'bg-surface-variant'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all ${
                    settings.perplexity_enabled
                      ? 'right-1 bg-on-primary-container'
                      : 'left-1 bg-outline'
                  }`} />
                </button>
              </div>
            </div>

            <button
              onClick={handleSettingsSave}
              className="w-full signature-glow text-on-primary-fixed font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all"
            >
              Save Settings
            </button>
          </div>

          {/* Feature Toggles Card */}
          <div className="col-span-12 bg-surface-container rounded-[1rem] p-6 sm:p-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-primary/20 rounded-full text-primary">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>tune</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Features</h2>
                <p className="text-on-surface-variant text-sm">Toggle agent capabilities on or off</p>
              </div>
            </div>
            <div className="space-y-4">
              {FEATURE_TOGGLES.map(f => (
                <div key={f.key} className="flex items-center justify-between py-3 border-b border-outline-variant/10 last:border-0">
                  <div>
                    <div className="font-medium text-on-surface">{f.label}</div>
                    <div className="text-sm text-on-surface-variant">{f.desc}</div>
                    {featureHealth[f.key] && !featureHealth[f.key].healthy && features[f.key] !== false && (
                      <span className="text-xs text-amber-400 flex items-center gap-1 mt-1" title="Missing required background tasks">
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                        Setup needed
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleFeature(f.key)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      features[f.key] !== false ? 'bg-primary' : 'bg-outline/30'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      features[f.key] !== false ? 'translate-x-6' : ''
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-outline-variant/10 flex justify-between items-center text-on-surface-variant">
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-widest font-bold">NanoClaw</span>
            <span className="h-1 w-1 rounded-full bg-outline-variant" />
            <span className="text-[10px] uppercase tracking-widest font-bold">End-to-End Encrypted</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
