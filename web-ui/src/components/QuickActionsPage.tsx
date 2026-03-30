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

export function QuickActionsPage({ onSend, authenticated }: Props) {
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
    await api.post('/api/quick-actions', { label: label.trim(), prompt: prompt.trim() });
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
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-8 md:p-12 max-w-6xl mx-auto w-full">
        {/* Hero Header */}
        <section className="mb-6 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-3 sm:mb-4 text-on-background">
            Quick <span className="text-primary italic">Actions</span>
          </h1>
          <p className="text-on-surface-variant text-sm sm:text-lg max-w-xl leading-relaxed">
            One-tap shortcuts to your most common requests. Click any action to send it instantly.
          </p>
        </section>

        {/* New action form */}
        {showNew && (
          <div className="bg-surface-container rounded-[1rem] p-5 sm:p-8 mb-6 sm:mb-8 border border-outline-variant/10 max-w-2xl">
            <h2 className="text-lg font-bold mb-4">Create New Action</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">Button Label</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Morning Briefing"
                  className="w-full h-10 bg-surface-container-highest text-on-surface text-sm rounded-xl px-4
                    border border-outline-variant/20 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="The full prompt that will be sent when clicking this action..."
                  rows={3}
                  className="w-full bg-surface-container-highest text-on-surface text-sm rounded-xl p-4
                    border border-outline-variant/20 focus:outline-none focus:border-primary resize-none leading-relaxed"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCreate}
                  className="signature-glow text-on-primary-fixed font-bold py-2.5 px-6 rounded-xl shadow-lg active:scale-[0.98] transition-transform text-sm"
                >
                  Create Action
                </button>
                <button
                  onClick={() => setShowNew(false)}
                  className="bg-surface-container-highest text-on-surface-variant font-medium py-2.5 px-6 rounded-xl hover:bg-surface-bright transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Add New Card */}
          <button
            onClick={() => setShowNew(!showNew)}
            className="bg-surface-container rounded-[1rem] p-5 sm:p-6 border border-dashed border-outline-variant/30
              flex flex-col items-center justify-center gap-3 min-h-[120px] sm:min-h-[160px]
              hover:border-primary/40 hover:bg-surface-container-high transition-all group"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-primary text-2xl">add</span>
            </div>
            <span className="text-sm font-bold text-on-surface-variant group-hover:text-primary transition-colors">New Action</span>
          </button>

          {actions.map((action) => (
            <div
              key={action.id}
              className="relative bg-surface-container rounded-[1rem] p-5 sm:p-6 border border-outline-variant/10
                flex flex-col items-center justify-center gap-3 sm:gap-4 min-h-[120px] sm:min-h-[160px]
                hover:bg-surface-container-high hover:shadow-[0_4px_20px_rgba(255,144,109,0.1)] transition-all group cursor-pointer"
              onClick={() => onSend(action.prompt)}
            >
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              </div>
              <div className="text-center">
                <h3 className="text-sm font-bold text-on-surface mb-1">{action.label}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">{action.prompt}</p>
              </div>

              {/* Delete overlay */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(action.id); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-container-highest/80
                  flex items-center justify-center opacity-0 group-hover:opacity-100
                  text-on-surface-variant hover:text-error hover:bg-error/10 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          ))}
        </div>

        {actions.length === 0 && !showNew && (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-on-surface-variant/20 text-7xl mb-4 block">bolt</span>
            <p className="text-on-surface-variant text-lg mb-2">No quick actions yet</p>
            <p className="text-on-surface-variant/60 text-sm">Create shortcuts for your most common requests</p>
          </div>
        )}
      </div>
    </div>
  );
}
