import type { View } from './Sidebar';

type MobileView = 'sessions' | 'memory' | 'workflows' | 'more';

interface Props {
  activeView: View;
  onViewChange: (view: View) => void;
  onMoreTap: () => void;
  moreOpen: boolean;
}

const ITEMS: { key: MobileView; icon: string; label: string }[] = [
  { key: 'sessions', icon: 'chat_bubble', label: 'Chat' },
  { key: 'memory', icon: 'auto_awesome', label: 'Memory' },
  { key: 'workflows', icon: 'account_tree', label: 'Flows' },
  { key: 'more', icon: 'more_horiz', label: 'More' },
];

export function BottomNav({ activeView, onViewChange, onMoreTap, moreOpen }: Props) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-lg border-t border-outline-variant/10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {ITEMS.map((item) => {
          const isMore = item.key === 'more';
          const isActive = isMore ? moreOpen : activeView === item.key;

          return (
            <button
              key={item.key}
              onClick={() => isMore ? onMoreTap() : onViewChange(item.key as View)}
              className={`flex flex-col items-center justify-center gap-0.5 w-16 h-12 rounded-2xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-primary'
                  : 'text-on-surface-variant/50'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px] transition-all duration-200"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-primary' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
