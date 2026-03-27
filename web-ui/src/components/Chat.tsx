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
  onSend: (content: string, images?: string[]) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

const SUGGESTIONS = [
  { icon: 'code', label: 'Write code', desc: 'Help me build a REST API with authentication' },
  { icon: 'edit_note', label: 'Create content', desc: 'Draft an email or write a blog post' },
  { icon: 'analytics', label: 'Analyze data', desc: 'Help me understand trends in my dataset' },
  { icon: 'lightbulb', label: 'Brainstorm', desc: 'Generate creative ideas for my project' },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Chat({ messages, isTyping, toolStatus, isQueued, connected, onSend, onDelete, readOnly }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const greeting = useMemo(() => getGreeting(), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, toolStatus]);

  return (
    <div className="flex flex-col h-full">
      {/* Disconnected banner */}
      {!connected && (
        <div className="mx-8 mt-4 h-10 bg-error-container/20 border border-error/30 rounded-[1rem]
          flex items-center gap-2 px-4 text-on-error-container text-[13px]">
          <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
          Connection lost. Attempting to reconnect...
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-12 py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-10">
            {/* Greeting */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-[72px] h-[72px] signature-glow rounded-full flex items-center justify-center shadow-[0_10px_40px_rgba(255,144,109,0.4)]">
                <span className="material-symbols-outlined text-on-primary-fixed text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
              </div>
              <h1 className="text-4xl font-black text-on-background tracking-tighter">
                {greeting}, Michael
              </h1>
              <p className="text-on-surface-variant text-lg">
                How can I help you today?
              </p>
            </div>

            {/* Suggestion cards */}
            <div className="flex gap-4 flex-wrap justify-center max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => onSend(s.desc)}
                  className="w-[200px] bg-surface-container-high rounded-xl p-5
                    flex flex-col gap-3 text-left hover:bg-surface-bright transition-colors border border-outline-variant/10"
                >
                  <span className="material-symbols-outlined text-primary">{s.icon}</span>
                  <span className="text-sm font-bold text-on-surface">{s.label}</span>
                  <span className="text-xs text-on-surface-variant leading-relaxed">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onDelete={onDelete} />
            ))}
            {isQueued && (
              <div className="flex items-center gap-3 px-5 py-3 bg-surface-container-high rounded-2xl w-fit">
                <span className="material-symbols-outlined text-on-surface-variant/60 text-[18px] animate-pulse">hourglass_top</span>
                <span className="text-sm text-on-surface-variant/80">Queued — another chat is being processed</span>
              </div>
            )}
            {isTyping && !messages.some((m) => m.streaming) && <TypingIndicator />}
            {toolStatus && <ToolStatus status={toolStatus} />}
          </div>
        )}
      </div>

      {/* Input */}
      {readOnly ? (
        <div className="px-12 pb-6 pt-3">
          <div className="max-w-3xl mx-auto flex items-center justify-center h-12 bg-surface-container-high border border-outline-variant/20 rounded-2xl text-on-surface-variant/40 text-sm">
            <span className="material-symbols-outlined text-[18px] mr-2">smartphone</span>
            Send messages from WhatsApp
          </div>
        </div>
      ) : (
        <InputBar onSend={onSend} disabled={!connected} />
      )}
    </div>
  );
}
