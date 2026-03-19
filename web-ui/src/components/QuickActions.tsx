import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

interface Props {
  onSend: (content: string) => void;
  authenticated: boolean;
}

export function QuickActions({ onSend, authenticated }: Props) {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.get<QuickAction[]>('/api/quick-actions');
      setActions(data);
    } catch {
      // ignore
    }
  }, [authenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!label.trim() || !prompt.trim()) return;
    await api.post('/api/quick-actions', {
      label: label.trim(),
      prompt: prompt.trim(),
    });
    setLabel('');
    setPrompt('');
    setShowNew(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/quick-actions/${id}`);
    refresh();
  };

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
        <span className="text-sm font-bold text-on-surface uppercase tracking-widest">Actions</span>
        <span className="flex-1" />
        <button
          onClick={() => setShowNew(!showNew)}
          className="h-[28px] signature-glow rounded-full px-3 flex items-center gap-1.5
            shadow-[0_2px_10px_rgba(255,144,109,0.2)] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-on-primary-fixed text-[14px]">add</span>
          <span className="text-[11px] font-bold text-on-primary-fixed">New</span>
        </button>
      </div>

      {/* New action form */}
      {showNew && (
        <div className="bg-surface-container-high rounded-xl p-4 space-y-3 border border-outline-variant/10">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Button label"
            className="w-full h-8 bg-surface-container-highest text-on-surface text-[12px] rounded-lg px-3
              border border-outline-variant/20 focus:outline-none focus:border-primary"
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt to send..."
            rows={2}
            className="w-full bg-surface-container-highest text-on-surface text-[12px] rounded-lg p-3
              border border-outline-variant/20 focus:outline-none focus:border-primary resize-none leading-relaxed"
          />
          <button
            onClick={handleCreate}
            className="w-full h-9 signature-glow text-on-primary-fixed text-[13px] font-bold rounded-full
              shadow-[0_4px_20px_rgba(255,144,109,0.3)] active:scale-[0.98] transition-transform"
          >
            Add Action
          </button>
        </div>
      )}

      <div className="h-px bg-outline-variant/10 shrink-0" />

      {/* Action grid */}
      <div className="flex-1 overflow-y-auto">
        {actions.length === 0 && (
          <div className="text-center text-on-surface-variant text-xs py-6">
            No quick actions yet
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onSend(action.prompt)}
              className="relative group bg-surface-container-high border border-outline-variant/10 rounded-xl p-3
                flex flex-col items-center justify-center gap-2 text-center
                hover:bg-surface-bright hover:border-primary/20 transition-all"
              title={action.prompt}
            >
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              <span className="text-[11px] font-bold text-on-surface">{action.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(action.id); }}
                className="absolute top-1 right-1 w-[18px] h-[18px] rounded
                  flex items-center justify-center opacity-0 group-hover:opacity-100
                  text-on-surface-variant hover:text-error transition-opacity"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
