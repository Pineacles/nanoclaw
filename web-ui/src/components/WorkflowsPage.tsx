import { useState, useCallback, useEffect } from 'react';
import type { WorkflowMeta, Workflow } from '../hooks/useWorkflows';

/* ── Helpers ── */

const SCOPE_LABELS: Record<string, { label: string; color: string }> = {
  group: { label: 'Global', color: 'bg-emerald-500/15 text-emerald-400' },
};

function scopeLabel(scope: string): { label: string; color: string } {
  if (scope.startsWith('session:')) {
    return { label: 'Session', color: 'bg-violet-500/15 text-violet-400' };
  }
  return SCOPE_LABELS[scope] || { label: scope, color: 'bg-surface-container-highest text-on-surface-variant' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DEFAULT_TEMPLATE = `---
name: New Workflow
description: Describe what this workflow does
scope: group
triggers:
  - "example trigger"
---

## Steps

1. First step
2. Second step
3. Third step

## API Reference

- **GET** \`/api/example\` — description
- **POST** \`/api/example\` — description
`;

/* ── Workflow Card ── */

function WorkflowCard({
  workflow,
  isSelected,
  onSelect,
  onDelete,
}: {
  workflow: WorkflowMeta;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scope = scopeLabel(workflow.scope);

  return (
    <div
      onClick={onSelect}
      className={`group relative bg-surface-container-high rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:bg-surface-bright/50 border ${
        isSelected
          ? 'border-primary/40 shadow-[0_0_20px_rgba(255,144,109,0.1)]'
          : 'border-transparent hover:border-outline-variant/20'
      }`}
    >
      {/* Top row: icon + name + scope badge */}
      <div className="flex items-start gap-3.5 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <span
            className="material-symbols-outlined text-primary text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            account_tree
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-on-surface text-[15px] leading-tight truncate">
            {workflow.name}
          </h3>
          {workflow.description && (
            <p className="text-xs text-on-surface-variant/70 mt-1 line-clamp-2 leading-relaxed">
              {workflow.description}
            </p>
          )}
        </div>
      </div>

      {/* Triggers */}
      {workflow.triggers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {workflow.triggers.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-surface-container-highest/80 text-on-surface-variant/80 text-[10px] font-medium px-2.5 py-1 rounded-lg"
            >
              <span className="material-symbols-outlined text-[11px] text-primary/60">
                electric_bolt
              </span>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Bottom row: scope + modified + delete */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${scope.color}`}>
          {scope.label}
        </span>
        <span className="text-[10px] text-on-surface-variant/40">
          {timeAgo(workflow.modified)}
        </span>
        <div className="flex-1" />
        {confirmDelete ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="text-[11px] font-bold text-error bg-error/10 px-3 py-1 rounded-lg hover:bg-error/20 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[11px] text-on-surface-variant px-2 py-1 rounded-lg hover:bg-surface-container-highest transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Editor ── */

function WorkflowEditor({
  workflow,
  onSave,
  onClose,
}: {
  workflow: Workflow | null;
  onSave: (filename: string, content: string) => Promise<void>;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (workflow) {
      setContent(workflow.content);
      setDirty(false);
    }
  }, [workflow]);

  const handleSave = async () => {
    if (!workflow || !dirty) return;
    setSaving(true);
    try {
      await onSave(workflow.filename, content);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <span
            className="material-symbols-outlined text-on-surface-variant/10 text-7xl block mb-4"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            account_tree
          </span>
          <p className="text-on-surface-variant/40 text-sm">Select a workflow to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Editor header */}
      <div className="flex items-center gap-3 px-5 sm:px-8 py-4 border-b border-outline-variant/10 shrink-0">
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-on-surface text-base truncate">{workflow.name}</h2>
          <p className="text-[11px] text-on-surface-variant/50">{workflow.filename}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Unsaved</span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`h-9 px-5 rounded-xl font-bold text-sm transition-all ${
              dirty
                ? 'signature-glow text-on-primary-fixed shadow-lg active:scale-[0.98]'
                : 'bg-surface-container-highest text-on-surface-variant/30 cursor-default'
            }`}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setDirty(true); }}
          className="w-full h-full bg-transparent text-on-surface text-sm leading-relaxed p-5 sm:p-8 resize-none focus:outline-none font-mono"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/* ── Create Dialog ── */

function CreateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (filename: string, content: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const filename = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '.md';

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const content = DEFAULT_TEMPLATE.replace('New Workflow', name.trim());
      await onCreate(filename, content);
      setName('');
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-container rounded-2xl p-6 w-full max-w-md shadow-2xl border border-outline-variant/10">
          <h2 className="text-lg font-bold text-on-surface mb-1">New Workflow</h2>
          <p className="text-xs text-on-surface-variant mb-5">
            Give your workflow a name. You can define steps, triggers, and API references in the editor.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Log New Food"
            autoFocus
            className="w-full bg-surface-container-highest text-on-surface text-sm rounded-xl py-3 px-4 border border-outline-variant/20 focus:outline-none focus:border-primary transition-colors mb-2"
          />
          {name.trim() && (
            <p className="text-[11px] text-on-surface-variant/50 mb-4 px-1">
              File: <span className="font-mono text-primary/70">{filename}</span>
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={onClose}
              className="h-9 px-5 rounded-xl text-on-surface-variant font-medium text-sm hover:bg-surface-container-highest transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="h-9 px-6 rounded-xl signature-glow text-on-primary-fixed font-bold text-sm shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main Page ── */

interface Props {
  workflows: WorkflowMeta[];
  selectedWorkflow: Workflow | null;
  loading: boolean;
  onSelect: (filename: string) => void;
  onSave: (filename: string, content: string) => Promise<void>;
  onCreate: (filename: string, content: string) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  onClearSelection: () => void;
}

export function WorkflowsPage({
  workflows,
  selectedWorkflow,
  loading,
  onSelect,
  onSave,
  onCreate,
  onDelete,
  onClearSelection,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [mobileEditing, setMobileEditing] = useState(false);

  const handleSelect = useCallback((filename: string) => {
    onSelect(filename);
    setMobileEditing(true);
  }, [onSelect]);

  const handleCloseEditor = useCallback(() => {
    setMobileEditing(false);
    onClearSelection();
  }, [onClearSelection]);

  // On desktop: split panel. On mobile: list or editor.
  return (
    <div className="flex-1 flex min-h-0">
      {/* Left panel — workflow list */}
      <div className={`${mobileEditing ? 'hidden' : 'flex'} lg:flex flex-col w-full lg:w-[380px] lg:border-r border-outline-variant/10 min-h-0`}>
        {/* Header */}
        <div className="p-4 sm:p-6 pb-0 shrink-0">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-on-background leading-none">
                Work<span className="text-primary italic">flows</span>
              </h1>
              <p className="text-xs text-on-surface-variant/50 mt-1.5">
                {workflows.length} workflow{workflows.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="h-9 signature-glow text-on-primary-fixed px-4 rounded-full font-bold text-sm active:scale-95 transition-transform shadow-lg flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New
            </button>
          </div>
        </div>

        {/* Workflow list */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-2">
          {workflows.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-3xl bg-surface-container-high flex items-center justify-center mx-auto mb-4">
                <span
                  className="material-symbols-outlined text-on-surface-variant/15 text-5xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  account_tree
                </span>
              </div>
              <p className="text-on-surface-variant/50 text-sm mb-1">No workflows yet</p>
              <p className="text-on-surface-variant/30 text-xs">
                Create one here or ask your assistant to build it
              </p>
            </div>
          )}
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.filename}
              workflow={wf}
              isSelected={selectedWorkflow?.filename === wf.filename}
              onSelect={() => handleSelect(wf.filename)}
              onDelete={() => onDelete(wf.filename)}
            />
          ))}
        </div>
      </div>

      {/* Right panel — editor */}
      <div className={`${mobileEditing ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-h-0 min-w-0`}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
          </div>
        ) : (
          <WorkflowEditor
            workflow={selectedWorkflow}
            onSave={onSave}
            onClose={handleCloseEditor}
          />
        )}
      </div>

      {/* Create dialog */}
      <CreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={onCreate}
      />
    </div>
  );
}
