/**
 * Memory database for NanoClaw agents.
 * Each group gets its own SQLite database with FTS5 full-text search.
 * Memories have importance scoring and temporal decay for human-like recall.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { GROUPS_DIR } from './config.js';

// Lazy-initialized per-group database connections
const dbs = new Map<string, Database.Database>();

function getMemoryDb(groupFolder: string): Database.Database {
  let db = dbs.get(groupFolder);
  if (db) return db;

  const dir = path.join(GROUPS_DIR, groupFolder, 'memories');
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'memories.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'observation',
      importance INTEGER NOT NULL DEFAULT 5,
      tags TEXT,
      source TEXT DEFAULT 'agent',
      created_at TEXT NOT NULL,
      last_accessed TEXT NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_memories_group ON memories(group_folder);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
    CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(last_accessed);
  `);

  // FTS5 virtual table for full-text search
  // Use IF NOT EXISTS via a try/catch since FTS5 doesn't support it in all builds
  try {
    db.exec(`
      CREATE VIRTUAL TABLE memories_fts USING fts5(
        content, tags, category,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags, category)
        VALUES (new.rowid, new.content, new.tags, new.category);
      END;

      CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags, category)
        VALUES ('delete', old.rowid, old.content, old.tags, old.category);
      END;

      CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags, category)
        VALUES ('delete', old.rowid, old.content, old.tags, old.category);
        INSERT INTO memories_fts(rowid, content, tags, category)
        VALUES (new.rowid, new.content, new.tags, new.category);
      END;
    `);
  } catch {
    // Already exists
  }

  dbs.set(groupFolder, db);
  return db;
}

// --- Types ---

export interface Memory {
  id: string;
  group_folder: string;
  content: string;
  category: string;
  importance: number;
  tags: string | null;
  source: string;
  created_at: string;
  last_accessed: string;
  access_count: number;
  archived: number;
}

export interface MemorySaveOpts {
  group_folder: string;
  content: string;
  category?: string;
  importance?: number;
  tags?: string;
  source?: string;
}

export interface MemorySearchOpts {
  group_folder: string;
  query: string;
  category?: string;
  limit?: number;
}

export interface MemorySearchResult extends Memory {
  score: number;
}

// --- Accessors ---

export function saveMemory(opts: MemorySaveOpts): string {
  const db = getMemoryDb(opts.group_folder);
  const id = `mem-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO memories (id, group_folder, content, category, importance, tags, source, created_at, last_accessed, access_count, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(
    id,
    opts.group_folder,
    opts.content,
    opts.category || 'observation',
    opts.importance ?? 5,
    opts.tags || null,
    opts.source || 'agent',
    now,
    now,
  );

  return id;
}

export function searchMemories(opts: MemorySearchOpts): MemorySearchResult[] {
  const db = getMemoryDb(opts.group_folder);
  const limit = opts.limit ?? 10;

  // FTS5 search with ranking
  const conditions: string[] = [
    'm.group_folder = ?',
    'm.archived = 0',
  ];
  const params: unknown[] = [opts.group_folder];

  if (opts.category) {
    conditions.push('m.category = ?');
    params.push(opts.category);
  }

  // Use FTS5 MATCH for the query
  const sql = `
    SELECT m.*, fts.rank as fts_rank
    FROM memories m
    JOIN memories_fts fts ON fts.rowid = m.rowid
    WHERE ${conditions.join(' AND ')}
      AND memories_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `;
  params.push(opts.query, limit * 3); // fetch extra for re-ranking

  let rows: Array<Memory & { fts_rank: number }>;
  try {
    rows = db.prepare(sql).all(...params) as Array<Memory & { fts_rank: number }>;
  } catch {
    // FTS query syntax error — fall back to LIKE search
    const likeSql = `
      SELECT m.*, 0 as fts_rank
      FROM memories m
      WHERE ${conditions.join(' AND ')}
        AND (m.content LIKE ? OR m.tags LIKE ?)
      ORDER BY m.last_accessed DESC
      LIMIT ?
    `;
    const likePattern = `%${opts.query}%`;
    // Replace the FTS match param with LIKE params
    rows = db.prepare(likeSql).all(...params.slice(0, -2), likePattern, likePattern, limit * 3) as Array<Memory & { fts_rank: number }>;
  }

  // Score and re-rank
  const scored: MemorySearchResult[] = rows.map((row) => {
    const daysSinceAccess = (Date.now() - new Date(row.last_accessed).getTime()) / 86400000;
    const score =
      row.importance * 2 +
      Math.log(row.access_count + 1) * 3 -
      daysSinceAccess * 0.1 +
      Math.abs(row.fts_rank) * 5;
    return { ...row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);

  // Bump access_count and last_accessed for returned results
  const now = new Date().toISOString();
  const updateStmt = db.prepare(
    'UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?',
  );
  const bumpAll = db.transaction(() => {
    for (const r of results) {
      updateStmt.run(now, r.id);
    }
  });
  bumpAll();

  return results;
}

export function getMemoryById(groupFolder: string, id: string): Memory | undefined {
  const db = getMemoryDb(groupFolder);
  return db.prepare('SELECT * FROM memories WHERE id = ? AND group_folder = ?').get(id, groupFolder) as Memory | undefined;
}

export function getRecentMemories(opts: {
  group_folder: string;
  limit?: number;
  since?: string;
}): Memory[] {
  const db = getMemoryDb(opts.group_folder);
  const conditions = ['group_folder = ?', 'archived = 0'];
  const params: unknown[] = [opts.group_folder];

  if (opts.since) {
    conditions.push('created_at > ?');
    params.push(opts.since);
  }

  const limit = opts.limit ?? 20;
  params.push(limit);

  return db.prepare(`
    SELECT * FROM memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as Memory[];
}

export function updateMemory(
  groupFolder: string,
  id: string,
  updates: Partial<Pick<Memory, 'content' | 'importance' | 'tags' | 'category'>>,
): boolean {
  const db = getMemoryDb(groupFolder);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.importance !== undefined) { fields.push('importance = ?'); values.push(updates.importance); }
  if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(updates.tags); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }

  if (fields.length === 0) return false;

  values.push(id, groupFolder);
  const result = db.prepare(
    `UPDATE memories SET ${fields.join(', ')} WHERE id = ? AND group_folder = ?`,
  ).run(...values);

  return result.changes > 0;
}

export function deleteMemory(groupFolder: string, id: string): boolean {
  const db = getMemoryDb(groupFolder);
  const result = db.prepare(
    'UPDATE memories SET archived = 1 WHERE id = ? AND group_folder = ?',
  ).run(id, groupFolder);
  return result.changes > 0;
}

/**
 * Archive old, low-value, rarely-accessed memories.
 * Returns the number of memories archived.
 */
export function consolidateMemories(
  groupFolder: string,
  opts?: { olderThanDays?: number; maxAccessCount?: number; maxImportance?: number },
): number {
  const db = getMemoryDb(groupFolder);
  const days = opts?.olderThanDays ?? 90;
  const maxAccess = opts?.maxAccessCount ?? 2;
  const maxImp = opts?.maxImportance ?? 3;

  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const result = db.prepare(`
    UPDATE memories SET archived = 1
    WHERE group_folder = ?
      AND archived = 0
      AND created_at < ?
      AND access_count <= ?
      AND importance <= ?
  `).run(groupFolder, cutoff, maxAccess, maxImp);

  return result.changes;
}

export interface MemoryStats {
  total: number;
  archived: number;
  by_category: Record<string, number>;
  avg_importance: number;
  oldest: string | null;
  newest: string | null;
  most_recalled: { content: string; access_count: number } | null;
  stale_count: number; // >30 days, never accessed
}

export function getMemoryStats(groupFolder: string): MemoryStats {
  const db = getMemoryDb(groupFolder);

  const total = (db.prepare(
    'SELECT COUNT(*) as n FROM memories WHERE group_folder = ? AND archived = 0',
  ).get(groupFolder) as { n: number }).n;

  const archived = (db.prepare(
    'SELECT COUNT(*) as n FROM memories WHERE group_folder = ? AND archived = 1',
  ).get(groupFolder) as { n: number }).n;

  const cats = db.prepare(
    'SELECT category, COUNT(*) as n FROM memories WHERE group_folder = ? AND archived = 0 GROUP BY category',
  ).all(groupFolder) as Array<{ category: string; n: number }>;
  const by_category: Record<string, number> = {};
  for (const c of cats) by_category[c.category] = c.n;

  const avgRow = db.prepare(
    'SELECT AVG(importance) as avg FROM memories WHERE group_folder = ? AND archived = 0',
  ).get(groupFolder) as { avg: number | null };

  const oldest = (db.prepare(
    'SELECT created_at FROM memories WHERE group_folder = ? AND archived = 0 ORDER BY created_at LIMIT 1',
  ).get(groupFolder) as { created_at: string } | undefined)?.created_at ?? null;

  const newest = (db.prepare(
    'SELECT created_at FROM memories WHERE group_folder = ? AND archived = 0 ORDER BY created_at DESC LIMIT 1',
  ).get(groupFolder) as { created_at: string } | undefined)?.created_at ?? null;

  const topRecall = db.prepare(
    'SELECT content, access_count FROM memories WHERE group_folder = ? AND archived = 0 ORDER BY access_count DESC LIMIT 1',
  ).get(groupFolder) as { content: string; access_count: number } | undefined;

  const staleCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const stale_count = (db.prepare(
    'SELECT COUNT(*) as n FROM memories WHERE group_folder = ? AND archived = 0 AND created_at < ? AND access_count = 0',
  ).get(groupFolder, staleCutoff) as { n: number }).n;

  return {
    total,
    archived,
    by_category,
    avg_importance: Math.round((avgRow.avg ?? 0) * 10) / 10,
    oldest,
    newest,
    most_recalled: topRecall ? { content: topRecall.content, access_count: topRecall.access_count } : null,
    stale_count,
  };
}
