import { useMemo, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
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

export function MemoryPage({
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
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 sm:p-8 md:p-12 max-w-6xl mx-auto w-full">
        {/* Hero Header */}
        <section className="mb-6 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-3 sm:mb-4 text-on-background">
            Agent <span className="text-primary italic">Memory</span>
          </h1>
          <p className="text-on-surface-variant text-sm sm:text-lg max-w-xl leading-relaxed">
            Memory files that shape the agent's knowledge and behavior. Edit with care — these define how it responds.
          </p>
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-4 sm:gap-8">
          {/* File List Panel */}
          <div className="col-span-12 md:col-span-4 bg-surface-container rounded-[1rem] p-4 sm:p-6 flex flex-col max-h-[400px] sm:max-h-[600px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Memory Files</h2>
              <button
                onClick={() => setShowNew(!showNew)}
                className="h-[32px] signature-glow rounded-full px-4 flex items-center gap-1.5
                  shadow-[0_2px_10px_rgba(255,144,109,0.2)] active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-on-primary-fixed text-[16px]">add</span>
                <span className="text-xs font-bold text-on-primary-fixed">New</span>
              </button>
            </div>

            {showNew && (
              <div className="flex gap-2 mb-4">
                <input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="filename.md"
                  className="flex-1 h-[36px] bg-surface-container-highest text-on-surface text-sm rounded-lg px-3
                    border border-outline-variant/20 focus:outline-none focus:border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <button
                  onClick={handleCreate}
                  className="h-[36px] signature-glow text-on-primary-fixed text-xs font-bold px-4 rounded-lg"
                >
                  Create
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1">
              {files.map((f) => (
                <button
                  key={f.filename}
                  onClick={() => onSelect(f.filename)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors duration-150 ${
                    selectedFile === f.filename
                      ? 'bg-surface-container-high border-outline-variant/20'
                      : 'border-transparent hover:bg-surface-container-high/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">description</span>
                    <div>
                      <div className={`text-sm ${
                        selectedFile === f.filename ? 'text-on-surface font-bold' : 'text-on-surface-variant'
                      }`}>
                        {f.filename}
                      </div>
                      <div className="text-[11px] text-on-surface-variant/60">
                        {(f.size / 1024).toFixed(1)} KB &middot; {new Date(f.modified).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Content Viewer / Editor */}
          <div className="col-span-12 md:col-span-8 bg-surface-container rounded-[1rem] p-4 sm:p-6 flex flex-col min-h-[300px] sm:min-h-[400px] max-h-[500px] sm:max-h-[600px]">
            {selectedFile ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-primary shrink-0">edit_document</span>
                    <h2 className="text-base sm:text-lg font-bold truncate">{selectedFile}</h2>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {editing ? (
                      <>
                        <button onClick={saveEdit} className="h-[34px] signature-glow text-on-primary-fixed text-sm font-bold px-5 rounded-xl shadow-lg active:scale-[0.98] transition-transform">
                          Save
                        </button>
                        <button onClick={() => setEditing(false)} className="h-[34px] bg-surface-container-highest text-on-surface-variant text-sm font-medium px-5 rounded-xl hover:bg-surface-bright transition-colors">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={startEdit} className="h-[34px] bg-surface-container-highest text-on-surface text-sm font-medium px-5 rounded-xl hover:bg-surface-bright transition-colors">
                          <span className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                            Edit
                          </span>
                        </button>
                        {onDelete && selectedFile !== 'CLAUDE.md' && (
                          confirmDelete ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => { onDelete(selectedFile); setConfirmDelete(false); }}
                                className="h-[34px] bg-error text-white text-sm font-medium px-4 rounded-xl"
                              >
                                Confirm Delete
                              </button>
                              <button
                                onClick={() => setConfirmDelete(false)}
                                className="h-[34px] bg-surface-container-highest text-on-surface-variant text-sm font-medium px-4 rounded-xl"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(true)}
                              className="h-[34px] bg-surface-container-highest text-error text-sm font-medium px-4 rounded-xl hover:bg-error/10 transition-colors flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                              Delete
                            </button>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>

                {editing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 w-full bg-surface-container-highest text-on-surface text-sm font-mono rounded-xl p-5 resize-none
                      border border-primary/20 focus:outline-none focus:border-primary leading-relaxed"
                  />
                ) : (
                  <RenderedContent content={content} loading={loading} />
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined text-on-surface-variant/30 text-6xl mb-4 block">auto_awesome</span>
                  <p className="text-on-surface-variant text-lg">Select a memory file to view its contents</p>
                  <p className="text-on-surface-variant/60 text-sm mt-2">These files shape the agent's knowledge and behavior</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RenderedContent({ content, loading }: { content: string; loading: boolean }) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  if (!content && loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-container-highest/50 rounded-xl border border-outline-variant/10">
        <div className="text-on-surface-variant text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-y-auto bg-surface-container-highest/50 rounded-xl border border-outline-variant/10 p-6 transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`}>
      <div
        className="markdown-content text-on-surface text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
