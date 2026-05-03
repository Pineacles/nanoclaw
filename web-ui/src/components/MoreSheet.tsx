import { MoodBlob } from './MoodBlob';
import { SessionsPanel } from './SessionsPanel';
import type { MoodData } from '../hooks/useMood';
import type { WebSession } from '../hooks/useSessions';
import type { View } from './Sidebar';

interface Props {
  open: boolean;
  onClose: () => void;
  mood: MoodData;
  features: Record<string, boolean>;
  sessions: WebSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateSession: (name?: string, mode?: 'persona' | 'plain') => void;
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
  features,
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
        {features.mood !== false && (
          <div className="border-b border-outline-variant/10 shrink-0">
            <div className="flex items-start gap-4 px-6 pt-4 pb-2 overflow-hidden">
              <MoodBlob mood={mood} size="sm" collapsed />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-on-surface capitalize">{mood.current_mood || 'chill'}</p>
                {mood.activity && (
                  <p className="text-[11px] text-on-surface-variant/70 italic mt-0.5 line-clamp-3">{mood.activity}</p>
                )}
                {/* MoodBlob in collapsed mode has no labels — these are the only mood name/activity */}
                {mood.energy !== undefined && (
                  <div className="flex items-center gap-2 mt-1.5">
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

            {/* Schedule strip — shows current + upcoming slots */}
            {mood.schedule && mood.schedule.length > 0 && (() => {
              const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
              // Find current slot index (latest slot where time <= now)
              let currentIdx = 0;
              for (let i = 0; i < mood.schedule.length; i++) {
                if (mood.schedule[i].time <= now) currentIdx = i;
              }
              // Show current + next 4 slots, wrapping around
              const visible: Array<{ slot: typeof mood.schedule[0]; isCurrent: boolean }> = [];
              for (let offset = 0; offset < 5 && offset < mood.schedule.length; offset++) {
                const idx = (currentIdx + offset) % mood.schedule.length;
                visible.push({ slot: mood.schedule[idx], isCurrent: offset === 0 });
              }
              return (
                <div className="px-6 pb-3">
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold mb-1.5">Schedule</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {visible.map(({ slot, isCurrent }, i) => (
                      <div
                        key={i}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 min-w-[68px] ${
                          isCurrent
                            ? 'bg-primary/15 border border-primary/40'
                            : 'bg-surface-container-high border border-transparent'
                        }`}
                      >
                        <p className={`text-[10px] font-bold ${isCurrent ? 'text-primary' : 'text-on-surface-variant/70'}`}>
                          {slot.time}
                        </p>
                        <p className={`text-[11px] capitalize mt-0.5 ${isCurrent ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                          {slot.mood}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-5 gap-1.5 px-4 py-4 border-b border-outline-variant/10 shrink-0">
          <button
            onClick={() => { onNavigate('tasks'); onClose(); }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-surface-container-high active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">settings_remote</span>
            <span className="text-[11px] text-on-surface-variant font-medium">Jobs</span>
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
          {features.voice_call !== false && (
            <button
              onClick={() => { onNavigate('voice'); onClose(); }}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-surface-container-high active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>call</span>
              <span className="text-[11px] text-on-surface-variant font-medium">Voice</span>
            </button>
          )}
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
