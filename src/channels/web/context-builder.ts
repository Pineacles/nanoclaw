/**
 * Context builder — assembles the [System: ...] block injected into every agent message.
 * Pulls from: group config, mood, memory/diary, and user-defined context/*.md files.
 * No hardcoded names, schedules, or activities.
 */

import path from 'path';
import fs from 'fs';

import { getGroupConfig, getGroupDir } from './group-config.js';
import { resolveMood } from './mood.js';
import { loadContextFiles } from './context-loader.js';
import { getRecentMemories } from '../../memory-db.js';

/* ── Mood Behaviors ── */

interface MoodBehavior {
  rules: string;
  tone: string;
}

let behaviorsCache: Record<string, MoodBehavior> | null = null;
let behaviorsCacheTime = 0;
const BEHAVIORS_CACHE_TTL = 60_000; // 60s

function loadMoodBehaviors(): Record<string, MoodBehavior> {
  const now = Date.now();
  if (behaviorsCache && now - behaviorsCacheTime < BEHAVIORS_CACHE_TTL) {
    return behaviorsCache;
  }
  const p = path.join(getGroupDir(), 'mood_behaviors.json');
  try {
    if (fs.existsSync(p)) {
      behaviorsCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
      behaviorsCacheTime = now;
      return behaviorsCache!;
    }
  } catch { /* fallback */ }
  behaviorsCache = {};
  behaviorsCacheTime = now;
  return behaviorsCache;
}

/* ── Per-Session Context ── */

export interface SessionContext {
  context: string;
  claude_md_disabled: boolean;
}

function sessionContextDir(): string {
  return path.join(getGroupDir(), 'session_context');
}

function sessionContextPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(sessionContextDir(), `${safe}.json`);
}

export function getSessionContext(sessionId: string): SessionContext {
  const fallback: SessionContext = { context: '', claude_md_disabled: false };
  const p = sessionContextPath(sessionId);
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return {
        context: raw.context || '',
        claude_md_disabled: !!raw.claude_md_disabled,
      };
    }
  } catch { /* fallback */ }
  return fallback;
}

export function saveSessionContext(sessionId: string, data: Partial<SessionContext>): SessionContext {
  const dir = sessionContextDir();
  fs.mkdirSync(dir, { recursive: true });
  const existing = getSessionContext(sessionId);
  const merged: SessionContext = {
    context: data.context !== undefined ? data.context : existing.context,
    claude_md_disabled: data.claude_md_disabled !== undefined ? data.claude_md_disabled : existing.claude_md_disabled,
  };
  fs.writeFileSync(sessionContextPath(sessionId), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function deleteSessionContext(sessionId: string): void {
  const p = sessionContextPath(sessionId);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* ignore */ }
}

/**
 * Build the full system context string for a message.
 */
export function buildAgentContext(opts: {
  sessionId: string;
  source?: 'web' | 'whatsapp';
}): string {
  const config = getGroupConfig();
  const tz = config.timezone;

  // Current time
  const zurichTime = new Date().toLocaleString('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // Mood
  const mood = resolveMood();
  const assistantName = config.assistant.name;
  const moodLine = `Your (${assistantName}'s) mood: ${mood.current_mood} (energy ${mood.energy}/10)${mood.activity ? ` — you are currently: ${mood.activity}` : ''}`;

  // Mood behavior rules
  const behaviors = loadMoodBehaviors();
  const behavior = behaviors[mood.current_mood];
  const behaviorBlock = behavior
    ? `Mood behavior: ${behavior.rules} Typical tone: ${behavior.tone}`
    : '';

  // Per-session context and settings
  const sessionCtx = getSessionContext(opts.sessionId);

  // When identity is disabled, only inject time + session context (no mood, no memory, no context files)
  if (sessionCtx.claude_md_disabled) {
    const parts: string[] = [`Current time is ${zurichTime}`];
    if (sessionCtx.context) {
      parts.push(`Session context: ${sessionCtx.context}`);
    }
    if (opts.source === 'whatsapp') {
      parts.push('Source: WhatsApp');
    } else {
      parts.push(`Chat session: ${opts.sessionId}`);
    }
    return `[System: ${parts.join('. ')}.]`;
  }

  // Memory context (diary + recent memories)
  const memoryContext = buildMemoryContext(config.group_folder);

  // User-defined context files
  const contextFiles = loadContextFiles();

  // Assemble
  const parts: string[] = [
    `Current time is ${zurichTime}`,
    moodLine,
  ];

  if (behaviorBlock) {
    parts.push(behaviorBlock);
  }

  // Session-specific context injection
  if (sessionCtx.context) {
    parts.push(`Session context: ${sessionCtx.context}`);
  }

  if (contextFiles) {
    parts.push(contextFiles);
  }

  if (opts.source === 'whatsapp') {
    parts.push('Source: WhatsApp');
  } else {
    parts.push(`Chat session: ${opts.sessionId}. Keep your responses specific to this conversation — do not reference or carry over context from other chat sessions`);
  }

  if (memoryContext) {
    parts.push(memoryContext);
  }

  return `[System: ${parts.join('. ')}.]`;
}

/** Return the mood data for external use (e.g. storing with message) */
export function getCurrentMood(): { current_mood: string; energy: number; activity: string } {
  return resolveMood();
}

/**
 * Build memory context — latest diary snippet + top recent memories.
 */
function buildMemoryContext(groupFolder: string): string {
  const parts: string[] = [];

  // Latest diary entry
  try {
    const diaryDir = path.join(getGroupDir(), 'diary');
    if (fs.existsSync(diaryDir)) {
      const entries = fs
        .readdirSync(diaryDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse();
      if (entries.length > 0) {
        const latest = fs
          .readFileSync(path.join(diaryDir, entries[0]), 'utf-8')
          .trim();
        const snippet =
          latest.length > 300 ? latest.slice(0, 300) + '...' : latest;
        parts.push(`Last diary (${entries[0].replace('.md', '')}): ${snippet}`);
      }
    }
  } catch {
    // Diary not available
  }

  // Recent memories
  try {
    const recent = getRecentMemories({ group_folder: groupFolder, limit: 5 });
    if (recent.length > 0) {
      const memLines = recent
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
        .map((m) => `  - [${m.category}] ${m.content.slice(0, 100)}`);
      parts.push(`Recent memories:\n${memLines.join('\n')}`);
    }
  } catch {
    // Memory DB not available
  }

  return parts.length > 0 ? parts.join('\n') : '';
}
