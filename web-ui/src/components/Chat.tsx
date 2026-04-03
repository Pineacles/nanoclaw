import { useEffect, useMemo, useRef } from 'react';
import type { ChatMessage, ToolStatus as ToolStatusType } from '../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ToolStatus } from './ToolStatus';
import { InputBar } from './InputBar';

interface Props {
  messages: ChatMessage[];
  isTyping: boolean;
  toolStatus: ToolStatusType | null;
  isQueued: boolean;
  connected: boolean;
  onSend: (content: string, images?: string[], files?: { name: string; data: string }[]) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

const SUGGESTIONS = [
  { icon: 'code', label: 'Write code', desc: 'Help me build a REST API' },
  { icon: 'edit_note', label: 'Create', desc: 'Draft an email or blog post' },
  { icon: 'analytics', label: 'Analyze', desc: 'Understand trends in data' },
  { icon: 'lightbulb', label: 'Brainstorm', desc: 'Generate creative ideas' },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getDateLabel(timestamp: string): string {
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: now.getFullYear() !== d.getFullYear() ? 'numeric' : undefined });
}

function getDateSeparators(messages: ChatMessage[]): Map<number, string> {
  const separators = new Map<number, string>();
  let lastLabel = '';
  for (let i = 0; i < messages.length; i++) {
    const label = getDateLabel(messages[i].timestamp);
    if (label !== lastLabel) {
      separators.set(i, label);
      lastLabel = label;
    }
  }
  return separators;
}

export function Chat({ messages, isTyping, toolStatus, isQueued, connected, onSend, onDelete, readOnly }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const greeting = useMemo(() => getGreeting(), []);
  const dateSeparators = useMemo(() => getDateSeparators(messages), [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, toolStatus]);

  return (
    <div className="flex flex-col h-full">
      {/* Disconnected banner */}
      {!connected && (
        <div className="mx-3 lg:mx-8 mt-2 lg:mt-4 h-9 lg:h-10 bg-error-container/20 border border-error/30 rounded-2xl
          flex items-center gap-2 px-4 text-on-error-container text-[13px]">
          <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
          <span className="lg:hidden">Reconnecting...</span>
          <span className="hidden lg:inline">Connection lost. Attempting to reconnect...</span>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 lg:px-12 py-3 lg:py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 lg:gap-10">
            {/* Greeting */}
            <div className="flex flex-col items-center gap-3 lg:gap-4 px-4">
              {/* Mobile: compact greeting */}
              <div className="w-12 h-12 lg:w-[72px] lg:h-[72px] signature-glow rounded-full flex items-center justify-center shadow-[0_10px_40px_rgba(255,144,109,0.4)]">
                <span className="material-symbols-outlined text-on-primary-fixed text-xl lg:text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
              </div>
              <h1 className="text-xl lg:text-4xl font-black text-on-background tracking-tighter text-center">
                {greeting}
              </h1>
              <p className="text-on-surface-variant text-sm lg:text-lg text-center">
                How can I help you?
              </p>
            </div>

            {/* Suggestion cards */}
            <div className="grid grid-cols-2 gap-2 lg:gap-4 lg:flex lg:flex-wrap lg:justify-center max-w-2xl w-full px-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => onSend(s.desc)}
                  className="lg:w-[200px] bg-surface-container-high rounded-2xl p-3.5 lg:p-5
                    flex flex-col gap-2 lg:gap-3 text-left active:scale-[0.97] transition-transform border border-outline-variant/10"
                >
                  <span className="material-symbols-outlined text-primary text-[20px] lg:text-[24px]">{s.icon}</span>
                  <span className="text-xs lg:text-sm font-bold text-on-surface">{s.label}</span>
                  <span className="text-[11px] lg:text-xs text-on-surface-variant leading-relaxed line-clamp-2">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 lg:space-y-8">
            {messages.map((msg, i) => (
              <div key={msg.id}>
                {dateSeparators.has(i) && (
                  <div className="flex items-center gap-3 lg:gap-4 my-3 lg:my-6">
                    <div className="flex-1 h-px bg-outline-variant/10" />
                    <span className="text-[10px] lg:text-xs text-on-surface-variant/40 font-medium uppercase tracking-wider shrink-0">
                      {dateSeparators.get(i)}
                    </span>
                    <div className="flex-1 h-px bg-outline-variant/10" />
                  </div>
                )}
                <MessageBubble message={msg} onDelete={onDelete} />
              </div>
            ))}
            {isQueued && (
              <div className="flex items-center gap-2 px-3 lg:px-5 py-2.5 bg-surface-container-high rounded-2xl w-fit text-xs text-on-surface-variant/70">
                <span className="material-symbols-outlined text-[16px] animate-pulse">hourglass_top</span>
                Queued
              </div>
            )}
            {isTyping && !messages.some((m) => m.streaming) && <TypingIndicator />}
            {toolStatus && <ToolStatus status={toolStatus} />}
          </div>
        )}
      </div>

      {/* Input */}
      {readOnly ? (
        <div className="px-3 lg:px-12 pb-2 lg:pb-6 pt-2">
          <div className="max-w-3xl mx-auto flex items-center justify-center h-11 lg:h-12 bg-surface-container-high border border-outline-variant/20 rounded-2xl text-on-surface-variant/40 text-sm">
            <span className="material-symbols-outlined text-[18px] mr-2">smartphone</span>
            <span className="hidden lg:inline">Send messages from WhatsApp</span>
            <span className="lg:hidden text-xs">WhatsApp only</span>
          </div>
        </div>
      ) : (
        <InputBar onSend={onSend} disabled={!connected} />
      )}
    </div>
  );
}
