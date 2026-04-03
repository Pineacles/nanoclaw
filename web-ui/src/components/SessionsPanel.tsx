import { useState } from 'react';
import type { WebSession } from '../hooks/useSessions';

interface Props {
  sessions: WebSession[];
  activeSessionId: string;
  onSelect: (id: string) => void;
  onCreate: (name?: string, mode?: 'persona' | 'plain') => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SessionsPanel({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);

  const startRename = (session: WebSession) => {
    setEditingId(session.id);
    setEditName(session.name);
  };

  const confirmRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3 relative">
        <button
          onClick={() => setShowNewMenu(!showNewMenu)}
          className="w-full h-[38px] signature-glow text-on-primary-fixed rounded-full text-[13px] font-bold
            flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,144,109,0.3)] hover:shadow-[0_4px_30px_rgba(255,144,109,0.5)] active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>New Session</span>
        </button>

        {showNewMenu && (
          <div className="absolute left-3 right-3 top-[52px] z-10 bg-surface-container-high rounded-xl border border-outline-variant/20 shadow-xl overflow-hidden">
            <button
              onClick={() => { onCreate(undefined, 'persona'); setShowNewMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-bright transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>face</span>
              </div>
              <div>
                <div className="text-[13px] font-medium text-on-surface">Persona</div>
                <div className="text-[11px] text-on-surface-variant/60">Full identity + mood + memory</div>
              </div>
            </button>
            <div className="h-px bg-outline-variant/10 mx-3" />
            <button
              onClick={() => { onCreate(undefined, 'plain'); setShowNewMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-bright transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant text-[16px]">smart_toy</span>
              </div>
              <div>
                <div className="text-[13px] font-medium text-on-surface">Plain</div>
                <div className="text-[11px] text-on-surface-variant/60">Clean Claude, no persona</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1" onClick={() => setShowNewMenu(false)}>
        {sessions.map((session) => {
          const isWhatsApp = session.id === 'whatsapp';
          const isPlain = session.mode === 'plain';
          return (
          <div
            key={session.id}
            className={`group flex items-center gap-2 px-4 py-3 rounded-xl cursor-pointer transition-all ${
              session.id === activeSessionId
                ? 'bg-surface-container-high border border-outline-variant/20 shadow-sm'
                : 'hover:bg-surface-container-high/50'
            }`}
            onClick={() => {
              if (editingId !== session.id && deletingId !== session.id) {
                onSelect(session.id);
              }
            }}
          >
            {editingId === session.id ? (
              <div className="flex-1 space-y-1.5">
                <input
                  className="w-full bg-surface-container-highest text-on-surface text-[13px] px-2 py-1 rounded-lg border border-primary outline-none"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={confirmRename}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    className="h-6 px-2.5 signature-glow text-on-primary-fixed rounded text-[11px] font-medium"
                    onClick={(e) => { e.stopPropagation(); confirmRename(); }}
                  >
                    Save
                  </button>
                  <button
                    className="h-6 px-2.5 bg-surface-container-highest text-on-surface-variant rounded text-[11px] font-medium"
                    onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : deletingId === session.id ? (
              <div className="flex-1 space-y-1.5">
                <div className="text-[13px] text-on-surface-variant truncate">{session.name}</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-error">Delete this session?</span>
                  <span className="flex-1" />
                  <button
                    className="h-6 px-2.5 bg-error text-white rounded text-[11px] font-medium"
                    onClick={(e) => { e.stopPropagation(); onDelete(session.id); setDeletingId(null); }}
                  >
                    Yes
                  </button>
                  <button
                    className="h-6 px-2.5 bg-surface-container-highest text-on-surface-variant rounded text-[11px] font-medium"
                    onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isWhatsApp ? 'bg-emerald-500/20' : isPlain ? 'bg-surface-container-highest' : 'bg-primary/15'
                }`}>
                  <span className={`material-symbols-outlined text-[16px] ${
                    isWhatsApp ? 'text-emerald-400' : isPlain ? 'text-on-surface-variant' : 'text-primary'
                  }`} style={!isWhatsApp && !isPlain ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                    {isWhatsApp ? 'smartphone' : isPlain ? 'smart_toy' : 'face'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] truncate ${
                    session.id === activeSessionId ? 'text-on-surface font-bold' : 'text-on-surface-variant'
                  }`}>
                    {session.name}
                  </div>
                  <div className="text-[10px] text-on-surface-variant/60">
                    {isWhatsApp ? 'Bridged from WhatsApp' : isPlain ? 'Plain Claude' : new Date(session.updated_at).toLocaleDateString()}
                  </div>
                </div>
                {!isWhatsApp && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-on-surface-variant hover:text-primary p-1 transition-colors"
                      title="Rename"
                      onClick={(e) => { e.stopPropagation(); startRename(session); }}
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      className="text-on-surface-variant hover:text-error p-1 transition-colors"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); setDeletingId(session.id); }}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
