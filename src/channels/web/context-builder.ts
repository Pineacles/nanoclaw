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
import { buildWorkflowSummary } from './workflow-loader.js';
import { getRecentMemories, searchMemories } from '../../memory-db.js';
import { getCachedMoodStyle } from './mood-style.js';
import { getRecentMoods } from '../../db.js';

/* ── Workspace File Index ── */

const FILE_ANNOTATIONS: Record<string, string> = {
  'credentials.md': 'All API keys for websites and services',
  'USER.md': "Michael's profile — read every conversation",
  'finance.md': 'Money, budgets, investments, stocks',
  'diet.md': 'Food, nutrition, calories, macros',
  'fitness.md': 'Exercise, workouts, weight, body',
  'psychology.md': 'Mental health, mood, habits, goals',
  'nutri_api.md': 'NutriPilot API reference',
};

let fileIndexCache: { data: string; time: number } = { data: '', time: 0 };
const FILE_INDEX_CACHE_TTL = 60_000;

function buildFileIndex(): string {
  const now = Date.now();
  if (fileIndexCache.time && now - fileIndexCache.time < FILE_INDEX_CACHE_TTL) {
    return fileIndexCache.data;
  }

  const groupDir = getGroupDir();
  const lines: string[] = [];

  // Root .md files
  try {
    const mdFiles = fs
      .readdirSync(groupDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const f of mdFiles) {
      if (f === 'CLAUDE.md') continue; // already loaded as system prompt
      const annotation = FILE_ANNOTATIONS[f] || '';
      lines.push(`  ${f}${annotation ? ` — ${annotation}` : ''}`);
    }
  } catch {
    /* ignore */
  }

  // Context files
  try {
    const ctxDir = path.join(groupDir, 'context');
    if (fs.existsSync(ctxDir)) {
      const ctxFiles = fs
        .readdirSync(ctxDir)
        .filter((f) => f.endsWith('.md'))
        .sort();
      for (const f of ctxFiles) {
        lines.push(`  context/${f}`);
      }
    }
  } catch {
    /* ignore */
  }

  // Workflow files
  try {
    const wfDir = path.join(groupDir, 'workflows');
    if (fs.existsSync(wfDir)) {
      const wfFiles = fs
        .readdirSync(wfDir)
        .filter((f) => f.endsWith('.md'))
        .sort();
      for (const f of wfFiles) {
        lines.push(`  workflows/${f}`);
      }
    }
  } catch {
    /* ignore */
  }

  const result =
    lines.length > 0
      ? `Workspace files (/workspace/group/):\n${lines.join('\n')}`
      : '';
  fileIndexCache = { data: result, time: now };
  return result;
}

/* ── Michael's Schedule ── */

interface MichaelScheduleOverride {
  date: string; // YYYY-MM-DD
  label: string; // "off day", "working from home", "trip to Berlin"
  wake?: string; // override wake time
  work_start?: string;
  work_end?: string;
  off?: boolean; // true = no work
  notes?: string;
}

interface MichaelScheduleData {
  overrides?: MichaelScheduleOverride[];
}

let michaelScheduleCache: { data: MichaelScheduleData | null; time: number } = {
  data: null,
  time: 0,
};
const MICHAEL_CACHE_TTL = 30_000;

function loadMichaelSchedule(): string {
  const now = Date.now();
  if (
    michaelScheduleCache.time &&
    now - michaelScheduleCache.time < MICHAEL_CACHE_TTL
  ) {
    if (michaelScheduleCache.data)
      return formatMichaelSchedule(michaelScheduleCache.data);
    return formatMichaelSchedule({});
  }

  const p = path.join(getGroupDir(), 'michael_schedule.json');
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      michaelScheduleCache = { data: raw, time: now };
      return formatMichaelSchedule(raw);
    }
  } catch {
    /* fallback */
  }
  michaelScheduleCache = { data: {}, time: now };
  return formatMichaelSchedule({});
}

function formatMichaelSchedule(data: MichaelScheduleData): string {
  const tz = getGroupConfig().timezone;
  const nowLocal = new Date().toLocaleString('en-CA', { timeZone: tz });
  const today = nowLocal.slice(0, 10); // YYYY-MM-DD
  const dayOfWeek = new Date().toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
  });
  const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

  // Check for override today
  const override = (data.overrides || []).find((o) => o.date === today);

  // Also gather upcoming overrides (next 7 days) for awareness
  const upcoming = (data.overrides || [])
    .filter((o) => o.date > today && o.date <= addDays(today, 7))
    .sort((a, b) => a.date.localeCompare(b.date));

  const parts: string[] = [];

  if (override) {
    if (override.off) {
      parts.push(
        `Michael's schedule today (${dayOfWeek}): Off — ${override.label}${override.notes ? `. ${override.notes}` : ''}`,
      );
    } else {
      const wake = override.wake || '05:45';
      const start = override.work_start || '06:30';
      const end = override.work_end || '17:00';
      parts.push(
        `Michael's schedule today (${dayOfWeek}): ${override.label}. Wake ${wake}, work ${start}–${end}${override.notes ? `. ${override.notes}` : ''}`,
      );
    }
  } else if (isWeekend) {
    parts.push(
      `Michael's schedule today (${dayOfWeek}): Weekend — no fixed schedule, flexible day`,
    );
  } else {
    // Default weekday
    const nowTime = new Date().toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    let status = 'at work';
    if (nowTime < '05:45') status = 'sleeping';
    else if (nowTime < '06:30') status = 'waking up / getting ready';
    else if (nowTime >= '17:00') status = 'off work';
    parts.push(
      `Michael's schedule today (${dayOfWeek}): Workday. Wake 05:45, work ~06:30–17:00. Currently: ${status}`,
    );
  }

  if (upcoming.length > 0) {
    const upcomingStr = upcoming
      .map((o) => {
        const d = new Date(o.date + 'T12:00:00');
        const day = d.toLocaleDateString('en-US', {
          timeZone: tz,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        return `${day}: ${o.label}`;
      })
      .join(', ');
    parts.push(`Upcoming: ${upcomingStr}`);
  }

  parts.push(
    `(You can edit /workspace/group/michael_schedule.json to add overrides — off days, special events, weekend plans. The default workday is Mon–Fri wake 05:45, work ~06:30–17:00.)`,
  );

  return parts.join('. ');
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  } catch {
    /* fallback */
  }
  behaviorsCache = {};
  behaviorsCacheTime = now;
  return behaviorsCache;
}

/* ── Personality Profile ── */

interface PersonalityTrait {
  score: number;
  description: string;
}
interface PersonalityProfile {
  openness: PersonalityTrait;
  conscientiousness: PersonalityTrait;
  extroversion: PersonalityTrait;
  agreeableness: PersonalityTrait;
  neuroticism: PersonalityTrait;
}

let personalityCache: { data: PersonalityProfile | null; time: number } = {
  data: null,
  time: 0,
};

function loadPersonalityProfile(): string {
  const now = Date.now();
  if (
    personalityCache.time &&
    now - personalityCache.time < BEHAVIORS_CACHE_TTL
  ) {
    if (!personalityCache.data) return '';
    return formatPersonality(personalityCache.data);
  }
  const p = path.join(getGroupDir(), 'personality.json');
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      personalityCache = { data: raw, time: now };
      return formatPersonality(raw);
    }
  } catch {
    /* fallback */
  }
  personalityCache = { data: null, time: now };
  return '';
}

function formatPersonality(p: PersonalityProfile): string {
  const traits = [
    `O=${p.openness.score.toFixed(1)} (${p.openness.description})`,
    `C=${p.conscientiousness.score.toFixed(1)} (${p.conscientiousness.description})`,
    `E=${p.extroversion.score.toFixed(1)} (${p.extroversion.description})`,
    `A=${p.agreeableness.score.toFixed(1)} (${p.agreeableness.description})`,
    `N=${p.neuroticism.score.toFixed(1)} (${p.neuroticism.description})`,
  ];
  return `Seyoung's personality (Big Five): ${traits.join(', ')}`;
}

/* ── Emotional State ── */

interface EmotionalState {
  mood: string;
  energy: number;
  trigger: string;
  duration_messages: number;
  resolves_when: string;
  underlying: string;
  updated_at: string;
}

let emotionalCache: { data: EmotionalState | null; time: number } = {
  data: null,
  time: 0,
};
const EMOTIONAL_CACHE_TTL = 30_000; // 30s — emotions change mid-conversation
const EMOTIONAL_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours — stale emotions decay

function loadEmotionalState(): string {
  const now = Date.now();
  if (emotionalCache.time && now - emotionalCache.time < EMOTIONAL_CACHE_TTL) {
    if (!emotionalCache.data) return '';
    return formatEmotionalState(emotionalCache.data, now);
  }
  const p = path.join(getGroupDir(), 'emotional_state.json');
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      emotionalCache = { data: raw, time: now };
      return formatEmotionalState(raw, now);
    }
  } catch {
    /* fallback */
  }
  emotionalCache = { data: null, time: now };
  return '';
}

function formatEmotionalState(e: EmotionalState, now: number): string {
  // Skip if older than 6 hours
  if (e.updated_at) {
    const age = now - new Date(e.updated_at).getTime();
    if (age > EMOTIONAL_STALE_MS) return '';
  }
  const parts = [`Seyoung's emotional undercurrent: ${e.mood}`];
  if (e.trigger) parts.push(`trigger: ${e.trigger}`);
  if (e.resolves_when) parts.push(`resolves when: ${e.resolves_when}`);
  if (e.underlying) parts.push(`underlying: ${e.underlying}`);
  return parts.join(', ');
}

/* ── Relationship Dynamics ── */

interface RelationshipDynamic {
  date: string;
  event: string;
  impact: number;
}
interface RelationshipState {
  temperature: number;
  trend: 'warming' | 'cooling' | 'stable';
  recent_dynamics: RelationshipDynamic[];
  updated_at: string;
}

let relationshipCache: { data: RelationshipState | null; time: number } = {
  data: null,
  time: 0,
};

function loadRelationshipState(): string {
  const now = Date.now();
  if (
    relationshipCache.time &&
    now - relationshipCache.time < BEHAVIORS_CACHE_TTL
  ) {
    if (!relationshipCache.data) return '';
    return formatRelationship(relationshipCache.data);
  }
  const p = path.join(getGroupDir(), 'relationship.json');
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      relationshipCache = { data: raw, time: now };
      return formatRelationship(raw);
    }
  } catch {
    /* fallback */
  }
  relationshipCache = { data: null, time: 0 };
  return '';
}

function formatRelationship(r: RelationshipState): string {
  const recent = (r.recent_dynamics || [])
    .slice(-3)
    .map((d) => `${d.event} (${d.impact > 0 ? '+' : ''}${d.impact})`)
    .join('; ');
  return `Seyoung's relationship with Michael: temperature ${r.temperature.toFixed(1)} (${r.trend})${recent ? ` — recent: ${recent}` : ''}`;
}

/* ── Per-Session Context ── */

export interface SessionContext {
  context: string;
}

function sessionContextDir(): string {
  return path.join(getGroupDir(), 'session_context');
}

function sessionContextPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(sessionContextDir(), `${safe}.json`);
}

export function getSessionContext(sessionId: string): SessionContext {
  const fallback: SessionContext = { context: '' };
  const p = sessionContextPath(sessionId);
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return { context: raw.context || '' };
    }
  } catch {
    /* fallback */
  }
  return fallback;
}

export function saveSessionContext(
  sessionId: string,
  data: Partial<SessionContext>,
): SessionContext {
  const dir = sessionContextDir();
  fs.mkdirSync(dir, { recursive: true });
  const existing = getSessionContext(sessionId);
  const merged: SessionContext = {
    context: data.context !== undefined ? data.context : existing.context,
  };
  fs.writeFileSync(
    sessionContextPath(sessionId),
    JSON.stringify(merged, null, 2),
    'utf-8',
  );
  return merged;
}

export function deleteSessionContext(sessionId: string): void {
  const p = sessionContextPath(sessionId);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/** Return the mood data for external use (e.g. storing with message) */
export function getCurrentMood(): {
  current_mood: string;
  energy: number;
  activity: string;
} {
  return resolveMood();
}

/** Load raw personality data for constraint generation */
function loadPersonalityData(): PersonalityProfile | null {
  const now = Date.now();
  if (
    personalityCache.time &&
    now - personalityCache.time < BEHAVIORS_CACHE_TTL
  ) {
    return personalityCache.data;
  }
  // loadPersonalityProfile() already populates the cache
  loadPersonalityProfile();
  return personalityCache.data;
}

/**
 * Build a single compact mood line for the per-message prefix.
 * Lists ALL moods sorted by weight descending (no top-N truncation).
 * Appends the cached Haiku writing-style summary when available and still valid.
 */
function buildMoodLine(groupFolder: string): string {
  const mood = resolveMood();
  const dist =
    mood.distribution && Object.keys(mood.distribution).length > 1
      ? mood.distribution
      : { [mood.current_mood]: 100 };

  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const blendParts = sorted.map(([name, weight]) => `${weight}% ${name}`);
  const blendStr = blendParts.join(', ');
  const energyActivity = `energy ${mood.energy}/10${mood.activity ? `, ${mood.activity}` : ''}`;

  let line = `mood blend: ${blendStr} (${energyActivity})`;

  // Append cached Haiku summary if distribution is still close enough
  const cached = getCachedMoodStyle(groupFolder);
  if (cached) {
    const cacheValid = !shouldCacheStyleBeSkipped(dist, cached.distribution);
    if (cacheValid && cached.summary) {
      line += ` — writing style: ${cached.summary}`;
    }
  }

  return line;
}

/**
 * Build a "Recent mood pattern" section for the system prompt.
 * Shows the last N primary moods Seyoung emitted, plus a sharp nudge
 * if she's been stuck on the same 1-2 moods for 4+ of the last 5 messages.
 * The nudge fires every message until she actually breaks pattern,
 * creating a tight feedback loop.
 */
function buildMoodHistorySection(chatJid: string): string {
  const moods = getRecentMoods(chatJid, 8);
  if (moods.length === 0) return '';

  // Show oldest → newest with arrow separators
  const trail = moods.join(' → ');
  let section = `Seyoung's recent mood pattern (last ${moods.length}, oldest → newest): ${trail}`;

  // Stuck detector: 4+ of the last 5 share the same 1-2 categories
  if (moods.length >= 5) {
    const last5 = moods.slice(-5);
    const counts = new Map<string, number>();
    for (const m of last5) counts.set(m, (counts.get(m) || 0) + 1);
    const sortedCats = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top1 = sortedCats[0];
    const top2 = sortedCats[1];
    const top1Count = top1?.[1] || 0;
    const top2Count = top2?.[1] || 0;
    const isStuck = (top1Count >= 4) || (top1Count + top2Count >= 5 && sortedCats.length <= 2);

    if (isStuck) {
      const stuckCats = top2 && top1Count + top2Count >= 5 && sortedCats.length <= 2
        ? `${top1[0]}/${top2[0]}`
        : top1[0];
      section += `\n\nNOTICE: You've been ${stuckCats} for ${top1Count + (top2 ? top2Count : 0)} of the last 5 messages. That's the safe pick winning. Look at Michael's actual current message — what would you really feel right now if you let yourself? Pick that, not the safe one. Bold mood picks are more honest than safe ones.`;
    }
  }

  return section;
}

/**
 * Returns true if the cached distribution is stale relative to the current one.
 * "Stale" means: different mood set, or any weight shifted by >= 10pt.
 */
function shouldCacheStyleBeSkipped(
  currentDist: Record<string, number>,
  cachedDist: Record<string, number>,
): boolean {
  const currentKeys = Object.keys(currentDist);
  const cachedKeys = Object.keys(cachedDist);
  if (currentKeys.length !== cachedKeys.length) return true;
  for (const k of currentKeys) {
    if (!(k in cachedDist)) return true;
    const diff = Math.abs((currentDist[k] || 0) - (cachedDist[k] || 0));
    if (diff >= 10) return true;
  }
  return false;
}

/**
 * Build the system-append block — heavy/slow-changing state.
 * Goes into systemPrompt.append via ContainerInput.systemInstruction.
 * Never stored in the conversation transcript.
 */
export function buildSystemAppend(opts: {
  sessionId: string;
  groupFolder: string;
  chatJid?: string;  // optional for backwards compat with the buildAgentContext wrapper
}): string {
  const groupDir = getGroupDir();
  const sections: string[] = [];

  // Personality profile
  const personalityProfile = loadPersonalityProfile();
  if (personalityProfile) {
    sections.push(personalityProfile);
  }

  // Personality constraint
  const personalityData = loadPersonalityData();
  if (personalityData) {
    const mood = resolveMood();
    const dist =
      mood.distribution && Object.keys(mood.distribution).length > 1
        ? mood.distribution
        : { [mood.current_mood]: 100 };
    const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    const constraints: string[] = [];
    if (personalityData.extroversion.score < 0.35)
      constraints.push('low extroversion — keep casual responses concise');
    if (personalityData.neuroticism.score > 0.6)
      constraints.push('high neuroticism — emotional reactions are genuine');
    if (personalityData.agreeableness.score < 0.4)
      constraints.push("low agreeableness — don't perform warmth");
    if (personalityData.openness.score > 0.7)
      constraints.push('high openness — follow curiosity naturally');
    const primaryWeight = sorted[0][1];
    const primaryMood = sorted[0][0];
    if (primaryWeight < 60)
      constraints.push(
        `mixed mood — blend writing styles, don't commit to one tone`,
      );
    if (primaryMood === 'sleeping' && primaryWeight > 50)
      constraints.push('mostly asleep — ultra-short responses');
    if (constraints.length > 0)
      sections.push(
        `Seyoung's personality constraint: ${constraints.join('; ')}`,
      );
  }

  // Relationship state
  const relationship = loadRelationshipState();
  if (relationship) sections.push(relationship);

  // Michael's schedule
  const michaelSchedule = loadMichaelSchedule();
  if (michaelSchedule) sections.push(michaelSchedule);

  // Diary + conversation summary
  const systemMemory = buildSystemMemoryContext(groupDir);
  if (systemMemory) sections.push(systemMemory);

  // Workflow summary
  const workflowSummary = buildWorkflowSummary(opts.sessionId);
  if (workflowSummary) sections.push(workflowSummary);

  // User-defined context files
  const contextFiles = loadContextFiles();
  if (contextFiles) sections.push(contextFiles);

  // Workspace file index
  const fileIndex = buildFileIndex();
  if (fileIndex) sections.push(fileIndex);

  // Recent mood pattern + stuck nudge (only if we know the chat JID)
  if (opts.chatJid) {
    const moodHistory = buildMoodHistorySection(opts.chatJid);
    if (moodHistory) sections.push(moodHistory);
  }

  return sections.join('\n\n');
}

/**
 * Build the per-message prefix — light/fast-changing state.
 * Prepended to the user message content and stored in the DB transcript.
 * ~10x smaller than the old buildAgentContext block.
 */
export function buildPerMessagePrefix(opts: {
  sessionId: string;
  source?: 'web' | 'whatsapp';
  messageHint?: string;
  groupFolder: string;
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

  const parts: string[] = [`Current time is ${zurichTime}`];

  // Compact mood line (unlimited blending, with cached Haiku summary if available)
  parts.push(buildMoodLine(opts.groupFolder));

  // Emotional undercurrent
  const emotional = loadEmotionalState();
  if (emotional) parts.push(emotional);

  // Per-session context
  const sessionCtx = getSessionContext(opts.sessionId);
  if (sessionCtx.context) {
    parts.push(`Session context: ${sessionCtx.context}`);
  }

  // Source / session identifier
  if (opts.source === 'whatsapp') {
    parts.push('Source: WhatsApp');
  } else {
    parts.push(
      `Chat session: ${opts.sessionId}. Keep your responses specific to this conversation — do not reference or carry over context from other chat sessions`,
    );
  }

  // Relevant memories (tied to what the user just said — stays per-message)
  const messageMemory = buildMessageMemoryContext(
    opts.groupFolder,
    opts.messageHint,
  );
  if (messageMemory) parts.push(messageMemory);

  return `[System: ${parts.join('. ')}.]`;
}

/**
 * Legacy wrapper — keeps existing callers (api-routes.ts context-preview) working.
 * Returns the combined system-append + per-message prefix for preview purposes.
 */
export function buildAgentContext(opts: {
  sessionId: string;
  source?: 'web' | 'whatsapp';
  messageHint?: string;
  groupFolder?: string;
  chatJid?: string;
}): string {
  const config = getGroupConfig();
  const groupFolder = opts.groupFolder ?? config.group_folder;
  const sysAppend = buildSystemAppend({
    sessionId: opts.sessionId,
    groupFolder,
    chatJid: opts.chatJid,
  });
  const prefix = buildPerMessagePrefix({
    sessionId: opts.sessionId,
    source: opts.source,
    messageHint: opts.messageHint,
    groupFolder,
  });
  return `${sysAppend}\n\n${prefix}`;
}

/**
 * Build memory context for systemAppend — diary entry + conversation summary only.
 */
function buildSystemMemoryContext(groupDir: string): string {
  const parts: string[] = [];

  // Latest diary entry (600 chars for deeper continuity)
  try {
    const diaryDir = path.join(groupDir, 'diary');
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
          latest.length > 600 ? latest.slice(0, 600) + '...' : latest;
        parts.push(`Last diary (${entries[0].replace('.md', '')}): ${snippet}`);
      }
    }
  } catch {
    // Diary not available
  }

  // Latest conversation summary (400 chars)
  try {
    const convDir = path.join(groupDir, 'conversations');
    if (fs.existsSync(convDir)) {
      const summaries = fs
        .readdirSync(convDir)
        .filter((f) => f.startsWith('summary-') && f.endsWith('.md'))
        .sort()
        .reverse();
      if (summaries.length > 0) {
        const latest = fs
          .readFileSync(path.join(convDir, summaries[0]), 'utf-8')
          .trim();
        const snippet =
          latest.length > 400 ? latest.slice(0, 400) + '...' : latest;
        parts.push(
          `Last conversation summary (${summaries[0].replace('summary-', '').replace('.md', '')}): ${snippet}`,
        );
      }
    }
  } catch {
    // Conversations not available
  }

  return parts.join('\n');
}

/**
 * Build memory context for per-message prefix — relevant/recent memories only.
 * Tied to what the user just said, so stays in the message transcript.
 */
function buildMessageMemoryContext(
  groupFolder: string,
  messageHint?: string,
): string {
  try {
    if (messageHint && messageHint.length > 5) {
      const relevant = searchMemories({
        group_folder: groupFolder,
        query: messageHint.slice(0, 200),
        limit: 5,
      });
      if (relevant.length > 0) {
        const memLines = relevant
          .slice(0, 5)
          .map((m) => `  - [${m.category}] ${m.content.slice(0, 100)}`);
        return `Relevant memories:\n${memLines.join('\n')}`;
      }
    } else {
      const recent = getRecentMemories({ group_folder: groupFolder, limit: 5 });
      if (recent.length > 0) {
        const memLines = recent
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 5)
          .map((m) => `  - [${m.category}] ${m.content.slice(0, 100)}`);
        return `Recent memories:\n${memLines.join('\n')}`;
      }
    }
  } catch {
    // Memory DB not available
  }
  return '';
}
