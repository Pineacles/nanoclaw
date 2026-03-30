import { useMemo, useState } from 'react';
import { parseAttachments, getFileIcon, type ParsedAttachment } from '../lib/attachments';
import { getToken } from '../lib/api';
import type { ChatMessage } from '../hooks/useChat';

type Filter = 'all' | 'images' | 'files';

interface SessionAttachment extends ParsedAttachment {
  messageId: string;
  timestamp: string;
  sender: 'user' | 'bot';
}

interface Props {
  messages: ChatMessage[];
  onClose: () => void;
}

function authUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(getToken())}`;
}

export function FilesPanel({ messages, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const allAttachments = useMemo(() => {
    const result: SessionAttachment[] = [];
    const seen = new Set<string>();
    for (const msg of messages) {
      const { attachments } = parseAttachments(msg.content);
      for (const att of attachments) {
        if (seen.has(att.filename)) continue;
        seen.add(att.filename);
        result.push({
          ...att,
          messageId: msg.id,
          timestamp: msg.timestamp,
          sender: msg.sender,
        });
      }
    }
    return result.reverse(); // newest first
  }, [messages]);

  const filtered = useMemo(() => {
    if (filter === 'all') return allAttachments;
    if (filter === 'images') return allAttachments.filter((a) => a.type === 'image');
    return allAttachments.filter((a) => a.type === 'file');
  }, [allAttachments, filter]);

  const imageCount = allAttachments.filter((a) => a.type === 'image').length;
  const fileCount = allAttachments.filter((a) => a.type === 'file').length;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full sm:w-96 z-[85] bg-surface border-l border-outline-variant/15 shadow-[-10px_0_40px_rgba(0,0,0,0.3)] flex flex-col animate-[slideInRight_200ms_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[22px]">folder_open</span>
            <h2 className="text-lg font-bold text-on-surface">Files</h2>
            <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
              {allAttachments.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-outline-variant/10">
          {([
            ['all', `All (${allAttachments.length})`],
            ['images', `Images (${imageCount})`],
            ['files', `Files (${fileCount})`],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === key
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant/20">folder_off</span>
              <p className="text-sm text-on-surface-variant/50">No attachments in this session</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Image grid for image filter */}
              {filter === 'images' || (filter === 'all' && imageCount > 0) ? (
                <>
                  {filter === 'all' && imageCount > 0 && (
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold mb-2">Images</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {filtered
                      .filter((a) => a.type === 'image')
                      .map((att) => (
                        <div key={att.filename} className="relative group aspect-square">
                          <img
                            src={authUrl(att.url)}
                            alt={att.displayName}
                            loading="lazy"
                            onClick={() => setLightboxUrl(att.url)}
                            className="w-full h-full object-cover rounded-lg cursor-pointer border border-outline-variant/10 hover:border-primary/30 transition-all"
                          />
                          <a
                            href={authUrl(att.url)}
                            download={att.displayName}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-1 right-1 w-6 h-6 bg-black/60 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <span className="material-symbols-outlined text-white text-[14px]">download</span>
                          </a>
                        </div>
                      ))}
                  </div>
                </>
              ) : null}

              {/* File list */}
              {(filter === 'files' || filter === 'all') && fileCount > 0 && (
                <>
                  {filter === 'all' && fileCount > 0 && (
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold mb-2">Files</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {filtered
                      .filter((a) => a.type === 'file')
                      .map((att) => (
                        <a
                          key={att.filename}
                          href={authUrl(att.url)}
                          download={att.displayName}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/10 hover:border-primary/20 transition-all group"
                        >
                          <span className="material-symbols-outlined text-[22px] text-on-surface-variant/60 shrink-0">
                            {getFileIcon(att.filename)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-on-surface truncate">{att.displayName}</p>
                            <p className="text-[10px] text-on-surface-variant/50">
                              {att.sender === 'user' ? 'You' : 'Assistant'} &middot; {new Date(att.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/40 group-hover:text-primary transition-colors shrink-0">
                            download
                          </span>
                        </a>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={authUrl(lightboxUrl)}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

/** Count attachments in a messages array (for badge display) */
export function countAttachments(messages: ChatMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    const { attachments } = parseAttachments(msg.content);
    count += attachments.length;
  }
  return count;
}
