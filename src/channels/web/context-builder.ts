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

/**
 * Build the full system context string for a message.
 * @param messageHint — first ~200 chars of the user's message, used for relevance-based memory retrieval
 */
export function buildAgentContext(opts: {
  sessionId: string;
  source?: 'web' | 'whatsapp';
  messageHint?: string;
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

  // Mood — with emotion distribution blending
  const mood = resolveMood();
  const assistantName = config.assistant.name;
  const behaviors = loadMoodBehaviors();

  // Build blended mood line from distribution or single mood
  const dist =
    mood.distribution && Object.keys(mood.distribution).length > 1
      ? mood.distribution
      : { [mood.current_mood]: 100 };

  // Sort by weight descending, take top 3
  const sorted = Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Build the full mood blend block with complete behavioral rules
  const moodLines: string[] = [
    `Seyoung's mood blend — Energy: ${mood.energy}/10${mood.activity ? ` — Activity: ${mood.activity}` : ''}`,
  ];
  for (const [name, weight] of sorted) {
    const b = behaviors[name];
    if (b) {
      moodLines.push(
        `  ${weight}% ${name}: ${b.rules}${b.tone ? ` Examples: ${b.tone}` : ''}`,
      );
    } else {
      moodLines.push(`  ${weight}% ${name}`);
    }
  }
  // Add explicit blending instruction so the model actually applies the weights
  const primaryWeight = sorted[0][1];
  const primaryName = sorted[0][0];
  if (sorted.length > 1 && primaryWeight < 80) {
    const secondary = sorted[1];
    moodLines.push(
      `BLENDING: Your dominant voice is ${primaryName} (${primaryWeight}%), but ${secondary[0]} (${secondary[1]}%) should visibly color your tone — it's not background noise, it actively shapes word choice, sentence length, and emotional openness. ${sorted.length > 2 ? `${sorted[2][0]} (${sorted[2][1]}%) adds occasional texture.` : ''} The blend should feel natural, not mechanical.`,
    );
  }
  const moodLine = moodLines.join('\n');

  // Personality constraint — derived from personality.json + current mood blend
  const personalityProfile = loadPersonalityProfile();
  const personalityData = loadPersonalityData();
  let constraintLine = '';
  if (personalityData) {
    const constraints: string[] = [];
    if (personalityData.extroversion.score < 0.35)
      constraints.push('low extroversion — keep casual responses concise');
    if (personalityData.neuroticism.score > 0.6)
      constraints.push('high neuroticism — emotional reactions are genuine');
    if (personalityData.agreeableness.score < 0.4)
      constraints.push("low agreeableness — don't perform warmth");
    if (personalityData.openness.score > 0.7)
      constraints.push('high openness — follow curiosity naturally');
    const primaryMood = sorted[0][0];
    const primaryWeight = sorted[0][1];
    if (primaryWeight < 60)
      constraints.push(
        `mixed mood — blend writing styles, don't commit to one tone`,
      );
    if (primaryMood === 'sleeping' && primaryWeight > 50)
      constraints.push('mostly asleep — ultra-short responses');
    if (constraints.length > 0)
      constraintLine = `Seyoung's personality constraint: ${constraints.join('; ')}`;
  }

  // Per-session context
  const sessionCtx = getSessionContext(opts.sessionId);

  // Memory context (diary + relevant memories + conversation summary)
  const memoryContext = buildMemoryContext(
    config.group_folder,
    opts.messageHint,
  );

  // User-defined context files
  const contextFiles = loadContextFiles();

  // Assemble
  const parts: string[] = [`Current time is ${zurichTime}`, moodLine];

  if (personalityProfile) parts.push(personalityProfile);
  if (constraintLine) parts.push(constraintLine);

  // Emotional undercurrent
  const emotional = loadEmotionalState();
  if (emotional) parts.push(emotional);

  // Relationship dynamics
  const relationship = loadRelationshipState();
  if (relationship) parts.push(relationship);

  // Michael's schedule
  const michaelSchedule = loadMichaelSchedule();
  if (michaelSchedule) parts.push(michaelSchedule);

  // Session-specific context injection
  if (sessionCtx.context) {
    parts.push(`Session context: ${sessionCtx.context}`);
  }

  if (contextFiles) {
    parts.push(contextFiles);
  }

  // Workflow summaries
  const workflowSummary = buildWorkflowSummary(opts.sessionId);
  if (workflowSummary) {
    parts.push(workflowSummary);
  }

  if (opts.source === 'whatsapp') {
    parts.push('Source: WhatsApp');
  } else {
    parts.push(
      `Chat session: ${opts.sessionId}. Keep your responses specific to this conversation — do not reference or carry over context from other chat sessions`,
    );
  }

  if (memoryContext) {
    parts.push(memoryContext);
  }

  return `[System: ${parts.join('. ')}.]`;
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
 * Build memory context — diary + conversation summary + relevant/recent memories.
 */
function buildMemoryContext(groupFolder: string, messageHint?: string): string {
  const parts: string[] = [];

  // Latest diary entry (600 chars for deeper continuity)
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
          latest.length > 600 ? latest.slice(0, 600) + '...' : latest;
        parts.push(`Last diary (${entries[0].replace('.md', '')}): ${snippet}`);
      }
    }
  } catch {
    // Diary not available
  }

  // Latest conversation summary (400 chars)
  try {
    const convDir = path.join(getGroupDir(), 'conversations');
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

  // Relevance-based memory retrieval (if message hint available) or recent fallback
  try {
    if (messageHint && messageHint.length > 5) {
      // Search for memories relevant to what the user is saying
      const relevant = searchMemories({
        group_folder: groupFolder,
        query: messageHint.slice(0, 200),
        limit: 5,
      });
      if (relevant.length > 0) {
        const memLines = relevant
          .slice(0, 5)
          .map((m) => `  - [${m.category}] ${m.content.slice(0, 100)}`);
        parts.push(`Relevant memories:\n${memLines.join('\n')}`);
      }
    } else {
      // Fallback: recent memories by importance
      const recent = getRecentMemories({ group_folder: groupFolder, limit: 5 });
      if (recent.length > 0) {
        const memLines = recent
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 5)
          .map((m) => `  - [${m.category}] ${m.content.slice(0, 100)}`);
        parts.push(`Recent memories:\n${memLines.join('\n')}`);
      }
    }
  } catch {
    // Memory DB not available
  }

  return parts.length > 0 ? parts.join('\n') : '';
}
