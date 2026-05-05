import { cn } from '../../lib/cn';
import { IconEdit, IconSearch, IconSettings, IconMedia } from '../../components/icons';
import { MoodDot } from '../../components/ui/MoodDot';
import { PillBadge } from '../../components/ui/PillBadge';
import { ThemeToggle } from '../../components/shell/ThemeToggle';

/* ── Mobile header ── */
interface MobileChatHeaderProps {
  sessionName: string;
  moodColor?: string;
  onSessionSwitch: () => void;
  onNewChat: () => void;
  onMediaOpen?: () => void;
}

export function MobileChatHeader({
  sessionName,
  moodColor,
  onSessionSwitch,
  onNewChat,
  onMediaOpen,
}: MobileChatHeaderProps) {
  return (
    <header className="nc-page flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-nc-bg border-b border-nc-border-soft">
      <div className="flex items-center gap-2">
        <MoodDot size={9} color={moodColor} />
        <button
          onClick={onSessionSwitch}
          aria-label="Switch session"
          className={cn(
            'nc-press flex items-center gap-1.5 border-none bg-transparent',
            'cursor-pointer px-2 py-1 rounded-btn text-nc-text',
          )}
        >
          <span className="text-sm font-medium">{sessionName}</span>
          {/* chevron */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className="flex gap-1">
        <ThemeToggle />
        {onMediaOpen && (
          <button
            onClick={onMediaOpen}
            aria-label="Open media gallery"
            className="nc-press w-8 h-8 flex items-center justify-center rounded-btn bg-transparent text-nc-text-muted hover:bg-nc-surface-hi transition-colors duration-[--nc-dur-micro]"
          >
            <IconMedia size={16} />
          </button>
        )}
        <button
          onClick={onNewChat}
          aria-label="New chat"
          className="nc-press w-8 h-8 flex items-center justify-center rounded-btn bg-transparent text-nc-text hover:bg-nc-surface-hi transition-colors duration-[--nc-dur-micro]"
        >
          <IconEdit size={16} />
        </button>
      </div>
    </header>
  );
}

/* ── Desktop header ── */
interface DesktopChatHeaderProps {
  sessionName: string;
  sessionMode?: 'persona' | 'plain' | 'whatsapp';
  hasMessages: boolean;
  modelLabel?: string;
  onMediaOpen?: () => void;
}

export function DesktopChatHeader({
  sessionName,
  sessionMode,
  hasMessages,
  modelLabel = 'Sonnet 4.5',
  onMediaOpen,
}: DesktopChatHeaderProps) {
  return (
    <header
      className={cn(
        'nc-page flex-shrink-0 flex items-center justify-between px-6 py-[14px]',
        'border-b border-nc-border-soft',
        hasMessages
          ? 'bg-transparent'
          : 'backdrop-blur-[12px]',
      )}
      style={{
        background: hasMessages
          ? 'transparent'
          : 'color-mix(in oklch, var(--nc-bg) 80%, transparent)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-medium text-nc-text">{sessionName}</span>
        {sessionMode === 'persona' && (
          <PillBadge variant="persona">persona</PillBadge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <button
          aria-label="Search messages"
          className="nc-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn border-none bg-transparent text-nc-text-muted text-[12.5px] cursor-pointer hover:bg-nc-surface-hi transition-colors duration-[--nc-dur-micro]"
        >
          <IconSearch size={16} />
          Search
        </button>
        {onMediaOpen && (
          <button
            aria-label="Open media gallery"
            onClick={onMediaOpen}
            className="nc-press w-8 h-8 flex items-center justify-center rounded-btn border-none bg-transparent text-nc-text-muted cursor-pointer hover:bg-nc-surface-hi transition-colors duration-[--nc-dur-micro]"
          >
            <IconMedia size={16} />
          </button>
        )}
        <button
          aria-label="Session settings"
          className="nc-press w-8 h-8 flex items-center justify-center rounded-btn border-none bg-transparent text-nc-text-muted cursor-pointer hover:bg-nc-surface-hi transition-colors duration-[--nc-dur-micro]"
        >
          <IconSettings size={16} />
        </button>
      </div>
      {!hasMessages && modelLabel && (
        <span className="absolute left-1/2 -translate-x-1/2 text-[11px] text-nc-text-dim">
          {modelLabel} · Persona on · Memory active
        </span>
      )}
    </header>
  );
}
