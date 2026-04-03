import { MoodBlob } from './MoodBlob';
import { SessionsPanel } from './SessionsPanel';
import type { MoodData } from '../hooks/useMood';
import type { WebSession } from '../hooks/useSessions';
import type { View } from './Sidebar';

interface Props {
  open: boolean;
  onClose: () => void;
  mood: MoodData;
  sessions: WebSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateSession: (name?: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onDeleteSession: (id: string) => void;
  onNavigate: (view: View) => void;
  attachmentCount: number;
  onOpenFiles: () => void;
}

export function MoreSheet({
  open,
  onClose,
  mood,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onNavigate,
  attachmentCount,
  onOpenFiles,
}: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-[1.5rem] shadow-[0_-8px_40px_rgba(0,0,0,0.4)] max-h-[85vh] flex flex-col animate-[slideUp_250ms_ease-out] pb-[env(safe-area-inset-bottom)]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-outline-variant/30" />
        </div>

        {/* Mood section */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-outline-variant/10 shrink-0">
          <MoodBlob mood={mood} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-on-surface capitalize">{mood.current_mood || 'chill'}</p>
            {mood.energy !== undefined && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-3 rounded-sm transition-all duration-500"
                      style={{
                        background: i < mood.energy
                          ? `hsl(${20 + mood.energy * 8}, 90%, ${55 + mood.energy * 2}%)`
                          : '#2a2522',
                      }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-on-surface-variant font-bold">{mood.energy}/10</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-4 gap-2 px-6 py-4 border-b border-outline-variant/10 shrink-0">
          <button
            onClick={() => { onNavigate('actions'); onClose(); }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-surface-container-high active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">bolt</span>
            <span className="text-[11px] text-on-surface-variant font-medium">Actions</span>
          </button>
          <button
            onClick={() => { onOpenFiles(); onClose(); }}
            className="relative flex flex-col items-center gap-1.5 py-3 rounded-xl bg-surface-container-high active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">folder_open</span>
            <span className="text-[11px] text-on-surface-variant font-medium">Files</span>
            {attachmentCount > 0 && (
              <span className="absolute top-1.5 right-1/4 min-w-[16px] h-4 flex items-center justify-center bg-primary text-[9px] font-bold text-on-primary-fixed rounded-full px-1">
                {attachmentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { onNavigate('settings'); onClose(); }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-surface-container-high active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">settings</span>
            <span className="text-[11px] text-on-surface-variant font-medium">Settings</span>
          </button>
          <button
            onClick={() => { onNavigate('context'); onClose(); }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-surface-container-high active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">draft</span>
            <span className="text-[11px] text-on-surface-variant font-medium">Context</span>
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 py-2">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold px-2 mb-1">Sessions</p>
          </div>
          <SessionsPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={(id) => { onSelectSession(id); onClose(); }}
            onCreate={onCreateSession}
            onRename={onRenameSession}
            onDelete={onDeleteSession}
          />
        </div>
      </div>
    </>
  );
}
