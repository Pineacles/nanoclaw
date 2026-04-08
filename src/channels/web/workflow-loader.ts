/**
 * Workflow loader — reads workflow .md files from groups/<folder>/workflows/
 * Workflows have YAML frontmatter (name, description, scope, triggers) and markdown body.
 * Agent creates workflows by writing files here; frontend can CRUD via API.
 */

import fs from 'fs';
import path from 'path';
import { getGroupDir } from './group-config.js';

export interface WorkflowMeta {
  filename: string;
  name: string;
  description: string;
  scope: string; // 'group' or 'session:<id>'
  triggers: string[];
  size: number;
  modified: string;
}

export interface Workflow extends WorkflowMeta {
  content: string; // full file content including frontmatter
  body: string; // just the markdown body (after frontmatter)
}

interface CachedWorkflows {
  data: WorkflowMeta[];
  loadedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30s — workflows may be created by agent mid-conversation
let cache: CachedWorkflows | null = null;

function workflowsDir(): string {
  return path.join(getGroupDir(), 'workflows');
}

/** Parse YAML-ish frontmatter from a workflow file */
function parseFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const raw = match[1];
  const body = match[2];
  const meta: Record<string, unknown> = {};

  let currentKey = '';
  let inArray = false;
  const arrayItems: string[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Array item
    if (trimmed.startsWith('- ') && inArray) {
      arrayItems.push(trimmed.slice(2).replace(/^["']|["']$/g, ''));
      continue;
    }

    // Flush previous array
    if (inArray && currentKey) {
      meta[currentKey] = [...arrayItems];
      arrayItems.length = 0;
      inArray = false;
    }

    // Key: value
    const kvMatch = trimmed.match(/^(\w+)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '' || value === '|') {
        // Could be start of array or multiline
        inArray = true;
        continue;
      }
      meta[currentKey] = value.replace(/^["']|["']$/g, '');
    }
  }

  // Flush trailing array
  if (inArray && currentKey) {
    meta[currentKey] = [...arrayItems];
  }

  return { meta, body };
}

function loadMeta(filename: string, content: string, stat: fs.Stats): WorkflowMeta {
  const { meta } = parseFrontmatter(content);
  return {
    filename,
    name: (meta.name as string) || filename.replace('.md', ''),
    description: (meta.description as string) || '',
    scope: (meta.scope as string) || 'group',
    triggers: Array.isArray(meta.triggers) ? (meta.triggers as string[]) : [],
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };
}

/** List all workflows with metadata */
export function listWorkflows(): WorkflowMeta[] {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const dir = workflowsDir();
  if (!fs.existsSync(dir)) {
    cache = { data: [], loadedAt: now };
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const data = files.map((f) => {
    const filePath = path.join(dir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    return loadMeta(f, content, stat);
  });

  cache = { data, loadedAt: now };
  return data;
}

/** Read a full workflow including body */
export function readWorkflow(filename: string): Workflow | null {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return null;
  const filePath = path.join(workflowsDir(), filename);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const meta = loadMeta(filename, content, stat);
  const { body } = parseFrontmatter(content);

  return { ...meta, content, body };
}

/** Write/update a workflow file */
export function writeWorkflow(filename: string, content: string): boolean {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  if (!filename.endsWith('.md')) return false;
  const dir = workflowsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
  invalidateWorkflowCache();
  return true;
}

/** Delete a workflow file */
export function deleteWorkflow(filename: string): boolean {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  const filePath = path.join(workflowsDir(), filename);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  invalidateWorkflowCache();
  return true;
}

/** Force cache refresh */
export function invalidateWorkflowCache(): void {
  cache = null;
}

/**
 * Build a compact summary of all workflows for agent context injection.
 * Only includes name, description, and triggers — not the full body.
 */
export function buildWorkflowSummary(sessionId?: string): string {
  const workflows = listWorkflows();
  if (workflows.length === 0) return '';

  // Filter by scope: include 'group' scope + matching session scope
  const visible = workflows.filter((w) => {
    if (w.scope === 'group') return true;
    if (sessionId && w.scope === `session:${sessionId}`) return true;
    return false;
  });

  if (visible.length === 0) return '';

  const lines = visible.map((w) => {
    const triggers = w.triggers.length > 0 ? ` [triggers: ${w.triggers.join(', ')}]` : '';
    return `  - ${w.name}: ${w.description}${triggers} (file: workflows/${w.filename})`;
  });

  return `Available workflows (read the full file in /workspace/group/workflows/ when executing):\n${lines.join('\n')}`;
}
