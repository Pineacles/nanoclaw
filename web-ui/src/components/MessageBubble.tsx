import { useMemo, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { useStreamingAnimation } from '../hooks/useStreamingAnimation';
import { MOOD_COLORS } from './MoodBlob';
import type { ChatMessage } from '../hooks/useChat';

interface Props {
  message: ChatMessage;
  onDelete?: (id: string) => void;
}

export function MessageBubble({ message, onDelete }: Props) {
  const isBot = message.sender === 'bot';
  const [showActions, setShowActions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayContent = useStreamingAnimation(
    message.content,
    !!message.streaming,
  );

  const contentToRender = isBot && message.streaming ? displayContent : message.content;

  const html = useMemo(() => {
    if (isBot) return renderMarkdown(contentToRender);
    return null;
  }, [isBot, contentToRender]);

  const time = useMemo(() => {
    const d = new Date(message.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [message.timestamp]);

  const handleDelete = () => {
    setDeleting(true);
    setTimeout(() => onDelete?.(message.id), 300);
  };

  const moodColor = MOOD_COLORS[message.mood || 'chill'] || MOOD_COLORS.chill;

  if (isBot) {
    return (
      <div className={`flex gap-3 max-w-2xl ${deleting ? 'message-fade-out' : ''}`}>
        {/* Mood blob dot */}
        <div
          className="w-7 h-7 rounded-full shrink-0 mt-1.5 transition-colors duration-700"
          style={{ background: moodColor }}
        />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="bg-surface-container-high rounded-r-[1rem] rounded-bl-[1rem] p-5 shadow-sm border-l-2 border-primary/30">
            <div
              className="markdown-content text-on-surface leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html! }}
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-on-surface-variant ml-1">
            <span>{time}</span>
            {message.streaming && (
              <span className="text-primary italic">streaming...</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // User message — delete is revealed on click, shown as a subtle bar below the bubble
  return (
    <div className={`flex flex-col items-end ${deleting ? 'message-fade-out' : ''}`}>
      <div className="max-w-xl">
        {/* Bubble — clicking toggles the action bar */}
        <div
          className="gradient-accent rounded-l-[1rem] rounded-tr-[1rem] px-5 py-4 shadow-[0_4px_20px_rgba(255,144,109,0.3)] cursor-pointer"
          onClick={() => !message.streaming && onDelete && setShowActions((v) => !v)}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-on-primary-container font-medium">
            {message.content}
          </p>
        </div>
      </div>

      {/* Meta row — always visible */}
      <div className="flex items-center gap-3 mt-1.5 mr-1">
        {/* Delete action bar — slides in smoothly */}
        {showActions && onDelete && !message.streaming && (
          confirmDelete ? (
            <div className="flex items-center gap-2 animate-[fadeIn_150ms_ease-out]">
              <span className="text-[11px] text-on-surface-variant">Delete message?</span>
              <button
                className="text-[11px] font-bold text-error hover:underline"
                onClick={handleDelete}
              >
                Yes
              </button>
              <button
                className="text-[11px] font-bold text-on-surface-variant hover:underline"
                onClick={() => { setConfirmDelete(false); setShowActions(false); }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              className="text-[11px] text-on-surface-variant/60 hover:text-error transition-colors flex items-center gap-1 animate-[fadeIn_150ms_ease-out]"
              onClick={() => setConfirmDelete(true)}
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
              Delete
            </button>
          )
        )}
        <span className="text-[10px] text-on-surface-variant">{time}</span>
      </div>
    </div>
  );
}
