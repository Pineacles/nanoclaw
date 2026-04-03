import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Attachment {
  name: string;
  dataUri: string;
  isImage: boolean;
}

interface Props {
  onSend: (content: string, images?: string[], files?: { name: string; data: string }[]) => void;
  disabled?: boolean;
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Detect touch-primary device (phone/tablet) */
function isMobile(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function InputBar({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content && attachments.length === 0) return;

    const images = attachments.filter((a) => a.isImage).map((a) => a.dataUri);
    const files = attachments.filter((a) => !a.isImage).map((a) => ({ name: a.name, data: a.dataUri }));

    onSend(
      content,
      images.length > 0 ? images : undefined,
      files.length > 0 ? files : undefined,
    );
    setText('');
    setAttachments([]);
  }, [text, attachments, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Desktop: Enter sends, Shift+Enter newline
      // Mobile: Enter always inserts newline, send via button only
      if (e.key === 'Enter') {
        if (isMobile()) {
          // Let Enter create newline on mobile — do nothing
          return;
        }
        if (e.shiftKey) {
          // Shift+Enter inserts newline on desktop — do nothing
          return;
        }
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const processed: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const dataUri = await resizeImage(file, 1568);
        processed.push({ name: file.name, dataUri, isImage: true });
      } else {
        const dataUri = await readFileAsDataUri(file);
        processed.push({ name: file.name, dataUri, isImage: false });
      }
    }
    setAttachments((prev) => [...prev, ...processed]);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        addFiles(pastedFiles);
      }
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const hasContent = text.trim() || attachments.length > 0;

  return (
    <div
      className="px-2.5 lg:px-12 pb-1.5 lg:pb-6 pt-1.5 lg:pt-3"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="max-w-3xl mx-auto">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {attachments.map((att, i) => (
              <div key={i} className="relative shrink-0">
                {att.isImage ? (
                  <img
                    src={att.dataUri}
                    alt=""
                    className="w-14 h-14 object-cover rounded-lg border border-outline-variant/20"
                  />
                ) : (
                  <div className="h-14 px-3 flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container max-w-[180px]">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60 shrink-0">description</span>
                    <span className="text-xs text-on-surface-variant truncate">{att.name}</span>
                  </div>
                )}
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error
                    rounded-full flex items-center justify-center shadow-md"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2 sm:gap-3 items-end">
          <div className="flex-1 flex items-end bg-surface-container-high border border-outline-variant/20 rounded-2xl
            focus-within:border-primary/40 transition-colors overflow-hidden min-h-[44px] sm:min-h-[48px]">
            {/* Attach */}
            <button
              className="h-11 sm:h-12 w-10 sm:w-12 flex items-center justify-center text-on-surface-variant/50 hover:text-on-surface-variant transition-colors shrink-0 self-end"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {/* Textarea — auto-resizes, supports multiline */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Send a message..."
              disabled={disabled}
              rows={1}
              className="flex-1 py-2.5 sm:py-3 bg-transparent text-on-surface text-sm
                placeholder:text-on-surface-variant/40 focus:outline-none border-none disabled:opacity-50 pr-3 resize-none leading-relaxed"
            />
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={disabled || !hasContent}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0
              transition-all duration-200 active:scale-90
              ${hasContent && !disabled
                ? 'signature-glow shadow-[0_4px_16px_rgba(255,120,78,0.35)] hover:shadow-[0_4px_24px_rgba(255,120,78,0.5)]'
                : 'bg-surface-container-high border border-outline-variant/20 text-on-surface-variant/30 cursor-not-allowed'
              }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={hasContent && !disabled ? { fontVariationSettings: "'FILL' 1", color: '#470e00' } : undefined}
            >
              arrow_upward
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
