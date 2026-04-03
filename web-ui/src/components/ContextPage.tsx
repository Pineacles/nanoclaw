import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';

interface ContextFile {
  filename: string;
  size: number;
  modified: string;
}

interface WebSession {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface SessionContextData {
  context: string;
}

/* ── Identity tab (CLAUDE.md system prompt editor) ── */

type IdentityFile = 'persona' | 'claude-md';

const IDENTITY_FILES: { key: IdentityFile; label: string; icon: string; description: string; endpoint: string }[] = [
  {
    key: 'persona',
    label: 'Persona',
    icon: 'face',
    description: 'Core identity, background, personality, communication style, relationships, and examples. Injected as the system prompt every message.',
    endpoint: '/api/system-prompt',
  },
  {
    key: 'claude-md',
    label: 'CLAUDE.md',
    icon: 'psychology',
    description: 'Memory system, tools, mood rules, diary instructions, and behavior guidelines. Loaded by the agent at the start of each conversation.',
    endpoint: '/api/memory/CLAUDE.md',
  },
];

function IdentityTab({ authenticated }: { authenticated: boolean }) {
  const [selected, setSelected] = useState<IdentityFile>('persona');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);

  const file = IDENTITY_FILES.find((f) => f.key === selected)!;

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setEditing(false);
    try {
      const data = await api.get<{ content: string }>(file.endpoint);
      setContent(data.content);
    } catch { setContent(''); }
    setLoading(false);
  }, [authenticated, file.endpoint]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    await api.put(file.endpoint, { content: editContent });
    setContent(editContent);
    setEditing(false);
  }, [file.endpoint, editContent]);

  const html = useMemo(() => content ? renderMarkdown(content) : '', [content]);

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-8">
      {/* File selector */}
      <div className="col-span-12 md:col-span-4 flex flex-col gap-4">
        <div className="bg-surface-container rounded-[1rem] p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            <h2 className="text-base sm:text-lg font-bold">Identity</h2>
          </div>

          <div className="space-y-1.5 mb-4">
            {IDENTITY_FILES.map((f) => (
              <button
                key={f.key}
                onClick={() => setSelected(f.key)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors duration-150 ${
                  selected === f.key
                    ? 'bg-surface-container-high border-outline-variant/20'
                    : 'border-transparent hover:bg-surface-container-high/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                  <span className={`text-sm ${selected === f.key ? 'text-on-surface font-bold' : 'text-on-surface-variant'}`}>
                    {f.label}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-surface-container-highest/50 rounded-xl p-3 border border-outline-variant/10">
            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed">
              {file.description}
            </p>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="col-span-12 md:col-span-8 bg-surface-container rounded-[1rem] p-4 sm:p-6 flex flex-col min-h-[300px] sm:min-h-[400px] max-h-[500px] sm:max-h-[600px]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base sm:text-lg font-bold">{file.label}</h2>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={save} className="h-[34px] signature-glow text-on-primary-fixed text-sm font-bold px-5 rounded-xl shadow-lg active:scale-[0.98]">Save</button>
                <button onClick={() => setEditing(false)} className="h-[34px] bg-surface-container-highest text-on-surface-variant text-sm font-medium px-5 rounded-xl hover:bg-surface-bright">Cancel</button>
              </>
            ) : (
              <button onClick={() => { setEditContent(content); setEditing(true); }} className="h-[34px] bg-surface-container-highest text-on-surface text-sm font-medium px-5 rounded-xl hover:bg-surface-bright flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Edit
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="flex-1 w-full bg-surface-container-highest text-on-surface text-sm font-mono rounded-xl p-5 resize-none border border-primary/20 focus:outline-none focus:border-primary leading-relaxed"
          />
        ) : (
          <div className={`flex-1 overflow-y-auto bg-surface-container-highest/50 rounded-xl border border-outline-variant/10 p-4 sm:p-6 ${loading ? 'opacity-60' : ''}`}>
            {content ? (
              <div className="markdown-content text-on-surface text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <p className="text-on-surface-variant/40 text-sm">Empty</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── General context tab (context/*.md files, always injected) ── */

function GeneralTab({ authenticated }: { authenticated: boolean }) {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.get<ContextFile[]>('/api/context');
      setFiles(data);
    } catch { /* ignore */ }
  }, [authenticated]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadFile = useCallback(async (filename: string) => {
    setLoading(true);
    setSelected(filename);
    setEditing(false);
    setConfirmDelete(false);
    try {
      const data = await api.get<{ filename: string; content: string }>(`/api/context/${encodeURIComponent(filename)}`);
      setContent(data.content);
    } catch { setContent(''); }
    setLoading(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!selected) return;
    await api.put(`/api/context/${encodeURIComponent(selected)}`, { content: editContent });
    setContent(editContent);
    setEditing(false);
    refresh();
  }, [selected, editContent, refresh]);

  const handleCreate = useCallback(async () => {
    const name = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;
    await api.put(`/api/context/${encodeURIComponent(name)}`, { content: '# New context file\n\nWrite context here. This will be injected into every agent message.\n' });
    setNewFileName('');
    setShowNew(false);
    refresh();
    loadFile(name);
  }, [newFileName, refresh, loadFile]);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    await api.delete(`/api/context/${encodeURIComponent(selected)}`);
    setSelected(null);
    setContent('');
    setConfirmDelete(false);
    refresh();
  }, [selected, refresh]);

  const html = useMemo(() => content ? renderMarkdown(content) : '', [content]);

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-8">
      <div className="col-span-12 md:col-span-4 bg-surface-container rounded-[1rem] p-4 sm:p-6 flex flex-col max-h-[400px] sm:max-h-[600px]">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-bold">Files</h2>
          <button
            onClick={() => setShowNew(!showNew)}
            className="h-[32px] signature-glow rounded-full px-4 flex items-center gap-1.5 shadow-[0_2px_10px_rgba(255,144,109,0.2)] active:scale-95 transition-all"
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
              className="flex-1 h-[36px] bg-surface-container-highest text-on-surface text-sm rounded-lg px-3 border border-outline-variant/20 focus:outline-none focus:border-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button onClick={handleCreate} className="h-[36px] signature-glow text-on-primary-fixed text-xs font-bold px-4 rounded-lg">
              Create
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {files.length === 0 && (
            <div className="text-center py-8 text-on-surface-variant/40 text-sm">No context files yet</div>
          )}
          {files.map((f) => (
            <button
              key={f.filename}
              onClick={() => loadFile(f.filename)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors duration-150 ${
                selected === f.filename
                  ? 'bg-surface-container-high border-outline-variant/20'
                  : 'border-transparent hover:bg-surface-container-high/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[18px]">draft</span>
                <div className="min-w-0">
                  <div className={`text-sm truncate ${selected === f.filename ? 'text-on-surface font-bold' : 'text-on-surface-variant'}`}>
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

      <div className="col-span-12 md:col-span-8 bg-surface-container rounded-[1rem] p-4 sm:p-6 flex flex-col min-h-[300px] sm:min-h-[400px] max-h-[500px] sm:max-h-[600px]">
        {selected ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-primary shrink-0">draft</span>
                <h2 className="text-base sm:text-lg font-bold truncate">{selected}</h2>
              </div>
              <div className="flex gap-2 shrink-0">
                {editing ? (
                  <>
                    <button onClick={saveEdit} className="h-[34px] signature-glow text-on-primary-fixed text-sm font-bold px-5 rounded-xl shadow-lg active:scale-[0.98]">Save</button>
                    <button onClick={() => setEditing(false)} className="h-[34px] bg-surface-container-highest text-on-surface-variant text-sm font-medium px-5 rounded-xl hover:bg-surface-bright">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditContent(content); setEditing(true); }} className="h-[34px] bg-surface-container-highest text-on-surface text-sm font-medium px-5 rounded-xl hover:bg-surface-bright flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      Edit
                    </button>
                    {confirmDelete ? (
                      <div className="flex gap-2">
                        <button onClick={handleDelete} className="h-[34px] bg-error text-white text-sm font-medium px-4 rounded-xl">Delete</button>
                        <button onClick={() => setConfirmDelete(false)} className="h-[34px] bg-surface-container-highest text-on-surface-variant text-sm font-medium px-4 rounded-xl">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(true)} className="h-[34px] bg-surface-container-highest text-error text-sm font-medium px-4 rounded-xl hover:bg-error/10 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 w-full bg-surface-container-highest text-on-surface text-sm font-mono rounded-xl p-5 resize-none border border-primary/20 focus:outline-none focus:border-primary leading-relaxed"
              />
            ) : (
              <div className={`flex-1 overflow-y-auto bg-surface-container-highest/50 rounded-xl border border-outline-variant/10 p-4 sm:p-6 ${loading ? 'opacity-60' : ''}`}>
                <div className="markdown-content text-on-surface text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-on-surface-variant/30 text-6xl mb-4 block">draft</span>
              <p className="text-on-surface-variant text-lg">Select a context file</p>
              <p className="text-on-surface-variant/60 text-sm mt-2">These files are injected into every agent conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Session context tab (per-session context + CLAUDE.md toggle) ── */

function SessionContextTab({ sessionId, sessionName, sessionMode, authenticated }: {
  sessionId: string;
  sessionName: string;
  sessionMode: 'persona' | 'plain';
  authenticated: boolean;
}) {
  const [ctx, setCtx] = useState<SessionContextData>({ context: '' });
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const data = await api.get<SessionContextData>(`/api/sessions/${encodeURIComponent(sessionId)}/context`);
      setCtx(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [authenticated, sessionId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    const updated = await api.put<SessionContextData>(
      `/api/sessions/${encodeURIComponent(sessionId)}/context`,
      { context: editContent },
    );
    setCtx(updated);
    setEditing(false);
  }, [sessionId, editContent]);

  const html = useMemo(() => ctx.context ? renderMarkdown(ctx.context) : '', [ctx.context]);

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-8">
      {/* Info panel */}
      <div className="col-span-12 md:col-span-4 flex flex-col gap-4">
        <div className="bg-surface-container rounded-[1rem] p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className={`material-symbols-outlined text-[22px] ${sessionMode === 'plain' ? 'text-on-surface-variant' : 'text-primary'}`}
              style={sessionMode !== 'plain' ? { fontVariationSettings: "'FILL' 1" } : undefined}>
              {sessionMode === 'plain' ? 'smart_toy' : 'face'}
            </span>
            <h2 className="text-base sm:text-lg font-bold truncate">{sessionName}</h2>
          </div>
          <p className="text-on-surface-variant text-sm leading-relaxed mb-4">
            Context specific to this session. Injected only when chatting in this session, alongside the general context.
          </p>

          <div className="bg-surface-container-highest/50 rounded-xl p-3 border border-outline-variant/10">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[14px] ${sessionMode === 'plain' ? 'text-on-surface-variant' : 'text-primary'}`}>
                {sessionMode === 'plain' ? 'smart_toy' : 'face'}
              </span>
              <p className="text-[11px] text-on-surface-variant/60">
                {sessionMode === 'plain'
                  ? 'Plain mode — no persona, no mood, no memory. Clean Claude.'
                  : 'Persona mode — full identity, mood, memory, and behavior rules.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Context editor */}
      <div className="col-span-12 md:col-span-8 bg-surface-container rounded-[1rem] p-4 sm:p-6 flex flex-col min-h-[300px] sm:min-h-[400px] max-h-[500px] sm:max-h-[600px]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base sm:text-lg font-bold">Session Context</h2>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={save} className="h-[34px] signature-glow text-on-primary-fixed text-sm font-bold px-5 rounded-xl shadow-lg active:scale-[0.98]">Save</button>
                <button onClick={() => setEditing(false)} className="h-[34px] bg-surface-container-highest text-on-surface-variant text-sm font-medium px-5 rounded-xl hover:bg-surface-bright">Cancel</button>
              </>
            ) : (
              <button onClick={() => { setEditContent(ctx.context); setEditing(true); }} className="h-[34px] bg-surface-container-highest text-on-surface text-sm font-medium px-5 rounded-xl hover:bg-surface-bright flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Edit
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="Add session-specific context here. For example: nutrition tracking rules, development guidelines, briefing format..."
            className="flex-1 w-full bg-surface-container-highest text-on-surface text-sm font-mono rounded-xl p-5 resize-none border border-primary/20 focus:outline-none focus:border-primary leading-relaxed placeholder:text-on-surface-variant/30"
          />
        ) : (
          <div className={`flex-1 overflow-y-auto bg-surface-container-highest/50 rounded-xl border border-outline-variant/10 p-4 sm:p-6 ${loading ? 'opacity-60' : ''}`}>
            {ctx.context ? (
              <div className="markdown-content text-on-surface text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <span className="material-symbols-outlined text-on-surface-variant/20 text-5xl mb-3 block">edit_note</span>
                  <p className="text-on-surface-variant/40 text-sm">No session context yet</p>
                  <p className="text-on-surface-variant/30 text-xs mt-1">Click Edit to add context specific to this session</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main ContextPage with tabs ── */

export function ContextPage({ authenticated }: { authenticated: boolean }) {
  const [activeTab, setActiveTab] = useState<string>('identity');
  const [sessions, setSessions] = useState<WebSession[]>([]);
  const [preview, setPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    api.get<WebSession[]>('/api/sessions').then(setSessions).catch(() => {});
  }, [authenticated]);

  const loadPreview = useCallback(async () => {
    try {
      const data = await api.get<{ context: string }>('/api/context/preview');
      setPreview(data.context);
      setShowPreview(true);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 sm:p-8 md:p-12 max-w-6xl mx-auto w-full">
        {/* Header */}
        <section className="mb-6 sm:mb-10">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-3 sm:mb-4 text-on-background">
            Context <span className="text-primary italic">Injection</span>
          </h1>
          <p className="text-on-surface-variant text-sm sm:text-lg max-w-xl leading-relaxed">
            Identity and general context are always injected. Session contexts are injected only in that session.
          </p>
        </section>

        {/* Preview button */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={loadPreview}
            className="h-9 bg-surface-container-high rounded-xl px-5 flex items-center gap-2 text-on-surface-variant text-sm font-medium hover:bg-surface-bright transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            Preview Assembled Context
          </button>
        </div>

        {/* Preview modal */}
        {showPreview && (
          <>
            <div className="fixed inset-0 z-[80] bg-black/50" onClick={() => setShowPreview(false)} />
            <div className="fixed inset-4 sm:inset-12 z-[85] bg-surface-container rounded-2xl p-6 overflow-y-auto border border-outline-variant/10 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Context Preview</h2>
                <button onClick={() => setShowPreview(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant/50 mb-4">This is what gets prepended to every message the agent receives:</p>
              <pre className="bg-surface-container-highest rounded-xl p-4 text-sm text-on-surface font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {preview}
              </pre>
            </div>
          </>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('identity')}
            className={`shrink-0 h-[38px] px-5 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'identity'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              Identity
            </span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`shrink-0 h-[38px] px-5 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">public</span>
              General
            </span>
          </button>

          {/* Divider */}
          {sessions.length > 0 && (
            <div className="shrink-0 w-px h-5 bg-outline-variant/20 mx-1" />
          )}

          {/* Session tabs */}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(`session:${s.id}`)}
              className={`shrink-0 h-[38px] px-5 rounded-xl text-sm font-medium transition-colors ${
                activeTab === `session:${s.id}`
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
                <span className="max-w-[120px] truncate">{s.name}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'identity' ? (
          <IdentityTab authenticated={authenticated} />
        ) : activeTab === 'general' ? (
          <GeneralTab authenticated={authenticated} />
        ) : activeTab.startsWith('session:') ? (
          (() => {
            const sid = activeTab.replace('session:', '');
            const session = sessions.find((s) => s.id === sid);
            return session ? (
              <SessionContextTab
                key={sid}
                sessionId={sid}
                sessionName={session.name}
                sessionMode={session.mode || 'persona'}
                authenticated={authenticated}
              />
            ) : null;
          })()
        ) : null}
      </div>
    </div>
  );
}
