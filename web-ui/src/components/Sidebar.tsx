import { MoodBlob } from './MoodBlob';
import type { MoodData } from '../hooks/useMood';

export type View = 'sessions' | 'memory' | 'tasks' | 'actions' | 'context' | 'settings';

interface Props {
  activeView: View;
  onViewChange: (view: View) => void;
  mood: MoodData;
  sessionList: React.ReactNode;
}

const NAV_ITEMS: { key: View; icon: string; label: string }[] = [
  { key: 'sessions', icon: 'chat_bubble', label: 'Sessions' },
  { key: 'memory', icon: 'auto_awesome', label: 'Memory' },
  { key: 'tasks', icon: 'settings_remote', label: 'Background Jobs' },
  { key: 'actions', icon: 'bolt', label: 'Quick Actions' },
  { key: 'context', icon: 'draft', label: 'Context' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

export function Sidebar({ activeView, onViewChange, mood, sessionList }: Props) {
  return (
    <nav className="hidden lg:flex fixed left-0 top-0 h-dvh w-72 flex-col py-8 px-5 z-40 bg-surface rounded-r-xl shadow-[40px_0_60px_-15px_rgba(0,0,0,0.3)]">
      {/* Brand */}
      <div className="mb-10 px-2 shrink-0">
        <div className="text-2xl font-black text-primary">NanoClaw</div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-1 mb-4 shrink-0">
        {NAV_ITEMS.map((item) => {
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
        </div>
      </div>
    </nav>
  );
}
