import { useMemo, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { parseAttachments, getFileIcon } from '../lib/attachments';
import { useStreamingAnimation } from '../hooks/useStreamingAnimation';
import { MOOD_COLORS } from './MoodBlob';
import { getToken } from '../lib/api';
import type { ChatMessage } from '../hooks/useChat';

interface Props {
  message: ChatMessage;
  onDelete?: (id: string) => void;
}

function authUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(getToken())}`;
}

function InlineImage({ url, alt }: { url: string; alt: string }) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <img
        src={authUrl(url)}
        alt={alt}
        loading="lazy"
        onClick={() => setLightbox(true)}
        className="rounded-lg max-w-full max-h-72 object-contain cursor-pointer hover:opacity-90 transition-opacity border border-outline-variant/10"
      />
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img
            src={authUrl(url)}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

function FileCard({ filename, displayName, url, variant }: { filename: string; displayName: string; url: string; variant: 'bot' | 'user' }) {
  const icon = getFileIcon(filename);
  const bgClass = variant === 'bot'
    ? 'bg-surface-container border border-outline-variant/15'
    : 'bg-white/10 border border-white/10';
  const textClass = variant === 'bot' ? 'text-on-surface' : 'text-on-primary-container';
  const subtextClass = variant === 'bot' ? 'text-on-surface-variant' : 'text-on-primary-container/70';

  return (
    <a
      href={authUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
      download={displayName}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl ${bgClass} hover:brightness-110 transition-all max-w-[280px]`}
    >
      <span className={`material-symbols-outlined text-[22px] ${subtextClass} shrink-0`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${textClass}`}>{displayName}</p>
      </div>
      <span className={`material-symbols-outlined text-[18px] ${subtextClass} shrink-0`}>download</span>
    </a>
  );
}

function AttachmentGrid({ attachments, variant }: { attachments: ReturnType<typeof parseAttachments>['attachments']; variant: 'bot' | 'user' }) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type === 'image');
  const files = attachments.filter((a) => a.type === 'file');

  return (
    <div className="flex flex-col gap-2 mt-2">
      {images.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${images.length === 1 ? '' : 'max-w-md'}`}>
          {images.map((att, i) => (
            <InlineImage key={i} url={att.url} alt={att.displayName} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((att, i) => (
            <FileCard key={i} filename={att.filename} displayName={att.displayName} url={att.url} variant={variant} />
          ))}
        </div>
      )}
    </div>
  );
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

  const { cleanContent, attachments } = useMemo(
    () => parseAttachments(contentToRender),
    [contentToRender],
  );

  const html = useMemo(() => {
    if (isBot) return renderMarkdown(cleanContent);
    return null;
  }, [isBot, cleanContent]);

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
      <div className={`flex gap-2 sm:gap-3 max-w-[calc(100%-1rem)] sm:max-w-2xl ${deleting ? 'message-fade-out' : ''}`}>
        {/* Mood blob dot */}
        <div
          className="w-5 h-5 sm:w-7 sm:h-7 rounded-full shrink-0 mt-1.5 transition-colors duration-700"
          style={{ background: moodColor }}
        />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="bg-surface-container-high rounded-r-[1rem] rounded-bl-[1rem] p-3 sm:p-5 shadow-sm border-l-2 border-primary/30">
            {cleanContent && (
              <div
                className="markdown-content text-on-surface leading-relaxed"
                dangerouslySetInnerHTML={{ __html: html! }}
              />
            )}
            <AttachmentGrid attachments={attachments} variant="bot" />
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

  // Parse user message for attachments too
  const userClean = cleanContent;

  // User message — delete is revealed on click, shown as a subtle bar below the bubble
  return (
    <div className={`flex flex-col items-end ${deleting ? 'message-fade-out' : ''}`}>
      <div className="max-w-[calc(100%-2rem)] sm:max-w-xl">
        {/* Bubble — clicking toggles the action bar */}
        <div
          className="gradient-accent rounded-l-[1rem] rounded-tr-[1rem] px-4 py-3 sm:px-5 sm:py-4 shadow-[0_4px_20px_rgba(255,144,109,0.3)] cursor-pointer"
          onClick={() => !message.streaming && onDelete && setShowActions((v) => !v)}
        >
          {userClean && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-on-primary-container font-medium">
              {userClean}
            </p>
          )}
          <AttachmentGrid attachments={attachments} variant="user" />
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
