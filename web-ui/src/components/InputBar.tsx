import { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onSend: (content: string, images?: string[]) => void;
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

export function InputBar({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content && images.length === 0) return;
    onSend(content, images.length > 0 ? images : undefined);
    setText('');
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.value = '';
    }
  }, [text, images, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const addImages = useCallback(async (files: FileList | File[]) => {
    const processed: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUri = await resizeImage(file, 1568);
      processed.push(dataUri);
    }
    setImages((prev) => [...prev, ...processed]);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImages(imageFiles);
      }
    },
    [addImages],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files) {
        addImages(e.dataTransfer.files);
      }
    },
    [addImages],
  );

  const hasContent = text.trim() || images.length > 0;

  return (
    <div
      className="px-12 pb-6 pt-3"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="max-w-3xl mx-auto">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <div key={i} className="relative shrink-0 w-14 h-14">
                <img
                  src={img}
                  alt=""
                  className="w-14 h-14 object-cover rounded-lg border border-outline-variant/20"
                />
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error
                    rounded-full flex items-center justify-center shadow-md"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row — all three elements (input box, send button) share the same 48px height */}
        <div className="flex gap-3">
          <div className="flex-1 h-12 flex items-center bg-surface-container-high border border-outline-variant/20 rounded-2xl
            focus-within:border-primary/40 transition-colors overflow-hidden">
            {/* Attach */}
            <button
              className="h-12 w-12 flex items-center justify-center text-on-surface-variant/50 hover:text-on-surface-variant transition-colors shrink-0"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
            >
              <span className="material-symbols-outlined text-[20px]">image</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addImages(e.target.files)}
            />

            {/* Text input — single line input, not textarea */}
            <input
              ref={textareaRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Message Seyoung..."
              disabled={disabled}
              className="flex-1 h-12 bg-transparent text-on-surface text-sm
                placeholder:text-on-surface-variant/40 focus:outline-none border-none disabled:opacity-50 pr-3"
            />
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={disabled || !hasContent}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
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
