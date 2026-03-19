import { useState } from 'react';
import type { MemoryFile } from '../hooks/useMemory';

interface Props {
  files: MemoryFile[];
  selectedFile: string | null;
  content: string;
  loading: boolean;
  onSelect: (filename: string) => void;
  onSave: (filename: string, content: string) => void;
  onCreate: (filename: string) => void;
  onDelete?: (filename: string) => void;
}

export function MemoryBrowser({
  files,
  selectedFile,
  content,
  loading,
  onSelect,
  onSave,
  onCreate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setEditContent(content);
    setEditing(true);
  };

  const saveEdit = () => {
    if (selectedFile) {
      onSave(selectedFile, editContent);
      setEditing(false);
    }
  };

  const handleCreate = () => {
    const name = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;
    onCreate(name);
    setNewFileName('');
    setShowNew(false);
  };

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
        <span className="text-sm font-bold text-on-surface uppercase tracking-widest">Thoughts</span>
        <span className="flex-1" />
        <button
          onClick={() => setShowNew(!showNew)}
          className="h-[28px] signature-glow rounded-full px-3 flex items-center gap-1.5
            shadow-[0_2px_10px_rgba(255,144,109,0.2)] hover:shadow-[0_2px_20px_rgba(255,144,109,0.4)] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-on-primary-fixed text-[14px]">add</span>
          <span className="text-[11px] font-bold text-on-primary-fixed">New</span>
        </button>
      </div>

      {/* Filename input */}
      {showNew && (
        <div className="flex gap-2">
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="filename.md"
            className="flex-1 h-[32px] bg-surface-container-highest text-on-surface text-[12px] rounded-lg px-3
              border border-outline-variant/20 focus:outline-none focus:border-primary"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="h-[32px] signature-glow text-on-primary-fixed text-[11px] font-bold px-3 rounded-lg"
          >
            Create
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {files.map((f) => (
          <button
            key={f.filename}
            onClick={() => onSelect(f.filename)}
            className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
              selectedFile === f.filename
                ? 'bg-surface-container-high border border-outline-variant/20'
                : 'hover:bg-surface-container-high/50'
            }`}
          >
            <div className={`text-[12px] ${
              selectedFile === f.filename ? 'text-on-surface font-bold' : 'text-on-surface-variant'
            }`}>
              {f.filename}
            </div>
            <div className="text-[10px] text-on-surface-variant/60">
              {(f.size / 1024).toFixed(1)} KB &middot;{' '}
              {new Date(f.modified).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>

      {/* Content viewer / editor */}
      {selectedFile && (
        <>
          <div className="h-px bg-outline-variant/10 shrink-0" />

          {editing ? (
            <>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 min-h-0 w-full bg-surface-container-highest text-on-surface text-[12px] font-mono rounded-xl p-3 resize-none
                  border border-primary/30 focus:outline-none leading-relaxed"
              />
              <div className="flex gap-2 shrink-0">
                <button onClick={saveEdit} className="h-[28px] signature-glow text-on-primary-fixed text-[11px] font-bold px-3 rounded-lg">
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="h-[28px] bg-surface-container-highest text-on-surface-variant text-[11px] font-medium px-3 rounded-lg">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 bg-surface-container-highest/50 rounded-xl border border-outline-variant/10 p-3 overflow-y-auto">
                {loading ? (
                  <div className="text-on-surface-variant text-sm">Loading...</div>
                ) : (
                  <pre className="text-on-surface-variant text-[12px] font-mono whitespace-pre-wrap leading-relaxed">
                    {content}
                  </pre>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={startEdit} className="h-[28px] bg-surface-container-highest text-on-surface text-[11px] font-medium px-3 rounded-lg hover:bg-surface-bright transition-colors">
                  Edit
                </button>
                {onDelete && selectedFile !== 'CLAUDE.md' && (
                  confirmDelete ? (
                    <>
                      <button
                        onClick={() => {
                          onDelete(selectedFile!);
                          setConfirmDelete(false);
                        }}
                        className="h-[28px] bg-error text-white text-[11px] font-medium px-3 rounded-lg"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="h-[28px] bg-surface-container-highest text-on-surface-variant text-[11px] font-medium px-3 rounded-lg"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="h-[28px] bg-surface-container-highest text-error text-[11px] font-medium px-3 rounded-lg flex items-center gap-1 hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                      Delete
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
