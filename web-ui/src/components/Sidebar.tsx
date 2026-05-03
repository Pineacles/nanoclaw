import { MoodBlob } from './MoodBlob';
import type { MoodData } from '../hooks/useMood';

export type View = 'sessions' | 'memory' | 'workflows' | 'tasks' | 'context' | 'voice' | 'settings';

interface Props {
  activeView: View;
  onViewChange: (view: View) => void;
  mood: MoodData;
  features: Record<string, boolean>;
  sessionList: React.ReactNode;
}

const NAV_ITEMS: { key: View; icon: string; label: string }[] = [
  { key: 'sessions', icon: 'chat_bubble', label: 'Sessions' },
  { key: 'memory', icon: 'auto_awesome', label: 'Memory' },
  { key: 'workflows', icon: 'account_tree', label: 'Workflows' },
  { key: 'tasks', icon: 'settings_remote', label: 'Background Jobs' },
  { key: 'context', icon: 'draft', label: 'Context' },
  { key: 'voice', icon: 'call', label: 'Voice Call' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

export function Sidebar({ activeView, onViewChange, mood, features, sessionList }: Props) {
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.key === 'voice' && features.voice_call === false) return false;
    return true;
  });

  return (
    <nav className="hidden lg:flex fixed left-0 top-0 h-dvh w-72 flex-col py-8 px-5 z-40 bg-surface rounded-r-xl shadow-[40px_0_60px_-15px_rgba(0,0,0,0.3)]">
      {/* Brand */}
      <div className="mb-10 px-2 shrink-0">
        <div className="text-2xl font-black text-primary">NanoClaw</div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-1 mb-4 shrink-0">
        {visibleItems.map((item) => {
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={`flex items-center gap-4 px-5 py-3 rounded-full transition-all duration-300 text-left ${
                isActive
                  ? 'gradient-accent text-white shadow-[0_0_20px_rgba(255,144,109,0.3)] translate-x-0.5'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-light text-sm">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Session list — only visible when on Sessions view */}
      {activeView === 'sessions' && (
        <div className="flex-1 min-h-0 overflow-hidden border-t border-outline-variant/10 pt-3">
          {sessionList}
        </div>
      )}

      {/* Spacer when not showing sessions */}
      {activeView !== 'sessions' && <div className="flex-1 min-h-0" />}

      {/* Mood section */}
      {features.mood !== false && (
        <div className="shrink-0 mt-2 pt-3 border-t border-outline-variant/10">
          <div className="flex flex-col items-center gap-2 px-2">
            <MoodBlob mood={mood} size="sm" />
            {mood.energy !== undefined && (
              <div className="flex items-center gap-1.5">
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
            {/* Schedule strip — current + next 4 slots, vertical list */}
            {mood.schedule && mood.schedule.length > 0 && (() => {
              const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
              // Find current slot (handling wrap)
              let wrapIdx = mood.schedule.length;
              for (let i = 1; i < mood.schedule.length; i++) {
                if (mood.schedule[i].time < mood.schedule[i - 1].time) { wrapIdx = i; break; }
              }
              const day = mood.schedule.slice(0, wrapIdx);
              const overnight = mood.schedule.slice(wrapIdx);
              let currentIdx = 0;
              if (overnight.length > 0 && now < day[0].time) {
                for (let i = 0; i < overnight.length; i++) if (overnight[i].time <= now) currentIdx = wrapIdx + i;
                if (now < overnight[0].time) currentIdx = wrapIdx - 1;
              } else {
                for (let i = 0; i < day.length; i++) if (day[i].time <= now) currentIdx = i;
              }
              const upcoming: Array<{ slot: typeof mood.schedule[0]; isCurrent: boolean }> = [];
              for (let offset = 0; offset < 5 && offset < mood.schedule.length; offset++) {
                const idx = (currentIdx + offset) % mood.schedule.length;
                upcoming.push({ slot: mood.schedule[idx], isCurrent: offset === 0 });
              }
              return (
                <div className="w-full mt-3 pt-3 border-t border-outline-variant/10">
                  <p className="text-[9px] uppercase tracking-widest text-on-surface-variant/50 font-bold mb-1.5 text-center">Schedule</p>
                  <div className="flex flex-col gap-0.5">
                    {upcoming.map(({ slot, isCurrent }, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-md px-2 py-1 ${
                          isCurrent
                            ? 'bg-primary/15 border border-primary/40'
                            : 'border border-transparent'
                        }`}
                      >
                        <span className={`text-[10px] font-bold tabular-nums ${isCurrent ? 'text-primary' : 'text-on-surface-variant/60'}`}>
                          {slot.time}
                        </span>
                        <span className={`text-[10px] capitalize ${isCurrent ? 'text-on-surface font-semibold' : 'text-on-surface-variant/80'}`}>
                          {slot.mood}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </nav>
  );
}
