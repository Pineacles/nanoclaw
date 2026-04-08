import fs from 'fs';
import path from 'path';
import { GROUPS_DIR } from '../../config.js';
import { countRecentMessages } from '../../db.js';
import { getGroupFolder, getGroupJid, getTimezone } from './group-config.js';
const OVERRIDE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/* ── Activity Interrupt ── */

// Activities containing these keywords are considered "solo" — interruptible by conversation
const SOLO_KEYWORDS = [
  'sleep', 'drawing', 'sketch', 'pilates', 'training', 'workout', 'gym',
  'out', 'dinner', 'restaurant', 'café', 'cafe', 'walk', 'shopping',
  'focused', 'deep work', 'meditating', 'yoga', 'running', 'skincare',
  'shower', 'bath',
];

const INTERRUPT_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
const INTERRUPT_THRESHOLD = 3; // messages needed to trigger interrupt
const INTERRUPT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min silence → back to original activity

interface ActivityOverride {
  original_activity: string;
  override_activity: string;
  block_time: string; // the schedule slot time this override applies to
  created_at: string;
}

function overridePath(): string {
  return path.join(GROUPS_DIR, getGroupFolder(), 'activity_override.json');
}

function isSoloActivity(activity: string): boolean {
  const lower = activity.toLowerCase();
  return SOLO_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Check if the current schedule block should be interrupted based on
 * recent conversation frequency. Returns the overridden activity string
 * or null if no interrupt.
 */
function resolveActivityInterrupt(
  scheduleActivity: string,
  blockTime: string,
): string | null {
  // Check for existing valid override first
  const p = overridePath();
  try {
    if (fs.existsSync(p)) {
      const existing: ActivityOverride = JSON.parse(fs.readFileSync(p, 'utf-8'));
      // Override is valid only for the current block
      if (existing.block_time !== blockTime) {
        // Block changed — stale override, remove it
        fs.unlinkSync(p);
      } else {
        // Block still active — check if conversation went quiet
        const cooldownSince = new Date(Date.now() - INTERRUPT_COOLDOWN_MS).toISOString();
        let chatJid: string;
        try { chatJid = getGroupJid(); } catch { return existing.override_activity; }
        const recentCount = countRecentMessages(chatJid, cooldownSince);
        if (recentCount === 0) {
          // Silence — she drifted back to what she was doing
          fs.unlinkSync(p);
          return null;
        }
        return existing.override_activity;
      }
    }
  } catch {
    // Corrupt file, ignore
  }

  // Only interrupt solo activities
  if (!scheduleActivity || !isSoloActivity(scheduleActivity)) return null;

  // Count recent user messages
  const sinceTimestamp = new Date(Date.now() - INTERRUPT_WINDOW_MS).toISOString();
  let chatJid: string;
  try {
    chatJid = getGroupJid();
  } catch {
    return null; // group config not loaded yet
  }
  const count = countRecentMessages(chatJid, sinceTimestamp);

  if (count < INTERRUPT_THRESHOLD) return null;

  // Extract the core activity for the override text
  const core = scheduleActivity
    .split('—')[0] // take part before em dash
    .split(',')[0] // take part before comma
    .trim()
    .toLowerCase();

  const override: ActivityOverride = {
    original_activity: scheduleActivity,
    override_activity: `chatting with Michael, pulled away from ${core}`,
    block_time: blockTime,
    created_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(p, JSON.stringify(override, null, 2), 'utf-8');
  } catch {
    // Non-critical — just return the override without persisting
  }

  return override.override_activity;
}

export interface MoodScheduleSlot {
  time: string;
  mood: string;
  energy: number;
  activity: string;
  distribution?: Record<string, number>;
}

export interface DailyWeights {
  base: Record<string, number>;
  random_factor: number;
  desired_override: string | null;
}

export interface MoodData {
  current_mood: string;
  energy: number;
  updated_at: string;
  schedule: MoodScheduleSlot[];
  daily_weights?: DailyWeights;
  distribution?: Record<string, number>;
}

export interface ResolvedMood {
  current_mood: string;
  energy: number;
  activity: string;
  updated_at: string;
  schedule: MoodScheduleSlot[];
  distribution?: Record<string, number>;
}

function moodPath(): string {
  return path.join(GROUPS_DIR, getGroupFolder(), 'mood.json');
}

function readMoodFile(): MoodData {
  const p = moodPath();
  if (!fs.existsSync(p)) {
    return { current_mood: 'chill', energy: 6, updated_at: '', schedule: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return { current_mood: 'chill', energy: 6, updated_at: '', schedule: [] };
  }
}

function writeMoodFile(data: MoodData): void {
  fs.writeFileSync(moodPath(), JSON.stringify(data, null, 2), 'utf-8');
}

function getZurichTimeStr(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: getTimezone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function findActiveSlot(schedule: MoodScheduleSlot[]): MoodScheduleSlot | null {
  if (!schedule || schedule.length === 0) return null;
  const now = getZurichTimeStr();

  // The schedule is chronological across a day cycle, but may wrap past midnight
  // (e.g. 00:00, 09:00, ..., 22:30, 01:30). Detect wrap: if the last slot's time
  // is earlier than the previous slot's time, everything after the wrap is "next day".
  let wrapIndex = schedule.length; // no wrap by default
  for (let i = 1; i < schedule.length; i++) {
    if (schedule[i].time < schedule[i - 1].time) {
      wrapIndex = i;
      break;
    }
  }

  const daySlots = schedule.slice(0, wrapIndex);
  const overnightSlots = schedule.slice(wrapIndex);

  // If we're in the overnight window (now < first day slot and overnight slots exist)
  if (overnightSlots.length > 0 && now < daySlots[0].time) {
    let active: MoodScheduleSlot | null = null;
    for (const slot of overnightSlots) {
      if (slot.time <= now) active = slot;
    }
    // Before first overnight slot — still on last day slot (e.g. 00:30 and overnight starts at 01:30)
    return active || daySlots[daySlots.length - 1];
  }

  // Normal daytime: find the latest day slot that has started
  let active: MoodScheduleSlot | null = null;
  for (const slot of daySlots) {
    if (slot.time <= now) active = slot;
  }
  return active || daySlots[daySlots.length - 1];
}

/**
 * Resolve current mood.
 * - If the agent overrode mood via tag within the last 15 minutes, use that override.
 * - Otherwise, fall back to the schedule slot for the current Zurich time.
 */
export function resolveMood(): ResolvedMood {
  const data = readMoodFile();

  // Activity from schedule, with conversation interrupt check
  const slot = findActiveSlot(data.schedule);
  const scheduleActivity = slot?.activity || '';
  const activity =
    resolveActivityInterrupt(scheduleActivity, slot?.time || '') || scheduleActivity;

  // Check if agent overrode mood via tag within the last 15 minutes
  if (data.updated_at) {
    const overrideAge = Date.now() - new Date(data.updated_at).getTime();
    if (overrideAge < OVERRIDE_WINDOW_MS && overrideAge >= 0) {
      return {
        current_mood: data.current_mood,
        energy: data.energy,
        activity,
        updated_at: data.updated_at,
        schedule: data.schedule,
        distribution: data.distribution,
      };
    }
  }

  // Override expired — revert to schedule (including schedule-level distribution)
  if (slot) {
    return {
      current_mood: slot.mood,
      energy: slot.energy,
      activity,
      updated_at: data.updated_at,
      schedule: data.schedule,
      distribution: slot.distribution,
    };
  }

  return {
    current_mood: data.current_mood,
    energy: data.energy,
    activity: '',
    updated_at: data.updated_at,
    schedule: data.schedule,
    distribution: data.distribution,
  };
}

/** Regex for distribution format: *[mood:chill:40,focused:30,hungry:30:6]* */
const MOOD_TAG_DIST = /\s*\*\[mood:((?:\w+:\d+,)*\w+:\d+):(\d+)\]\*\s*$/;
/** Regex for simple format: *[mood:chill:6]* */
const MOOD_TAG_SIMPLE = /\s*\*\[mood:(\w+):(\d+)\]\*\s*$/;
/** Regex for old format: [mood:X] or [mood:X energy:Y] anywhere */
const MOOD_TAG_OLD = /\[mood:(\w+)(?:\s+energy:(\d+))?\]\s*/g;

/** Parse a distribution string like "chill:40,focused:30,hungry:30" into Record<string, number> */
function parseDistribution(distStr: string): Record<string, number> | null {
  const parts = distStr.split(',');
  if (parts.length < 2) return null; // single mood, not a distribution
  const dist: Record<string, number> = {};
  for (const part of parts) {
    const [name, weight] = part.split(':');
    if (!name || !weight) return null;
    dist[name] = parseInt(weight, 10);
  }
  return dist;
}

/** Strip all mood tag formats from text for display */
export function stripMoodTags(text: string): string {
  return text
    .replace(MOOD_TAG_DIST, '')
    .replace(MOOD_TAG_SIMPLE, '')
    .replace(MOOD_TAG_OLD, '')
    .trim();
}

/**
 * Parse mood tags from bot text. Supports:
 *   *[mood:chill:40,focused:30,hungry:30:6]* (distribution, preferred)
 *   *[mood:chill:6]* (simple, backward compat)
 *   [mood:chill energy:6] (old, inline)
 * Updates mood.json immediately as a manual override.
 */
export function applyMoodTag(text: string): {
  cleanText: string;
  mood: string;
} {
  // Try distribution format first (new, preferred)
  const distMatch = text.match(MOOD_TAG_DIST);
  if (distMatch) {
    const distStr = distMatch[1];
    const newEnergy = parseInt(distMatch[2], 10);
    const dist = parseDistribution(distStr);
    const cleanText = stripMoodTags(text);

    if (dist) {
      // Primary mood = highest weight
      const primary = Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0];
      const data = readMoodFile();
      data.current_mood = primary;
      data.energy = newEnergy;
      data.distribution = dist;
      data.updated_at = new Date().toISOString();
      writeMoodFile(data);
      return { cleanText, mood: primary };
    }
  }

  // Try simple format
  const simpleMatch = text.match(MOOD_TAG_SIMPLE);
  if (simpleMatch) {
    const newMood = simpleMatch[1];
    const newEnergy = parseInt(simpleMatch[2], 10);
    const cleanText = stripMoodTags(text);

    const data = readMoodFile();
    data.current_mood = newMood;
    data.energy = newEnergy;
    data.distribution = { [newMood]: 100 };
    data.updated_at = new Date().toISOString();
    writeMoodFile(data);

    return { cleanText, mood: newMood };
  }

  // Try old format
  const oldMatch = text.match(/\[mood:(\w+)(?:\s+energy:(\d+))?\]/);
  if (oldMatch) {
    const newMood = oldMatch[1];
    const newEnergy = oldMatch[2] ? parseInt(oldMatch[2], 10) : undefined;
    const cleanText = stripMoodTags(text);

    const data = readMoodFile();
    data.current_mood = newMood;
    if (newEnergy !== undefined) data.energy = newEnergy;
    data.distribution = { [newMood]: 100 };
    data.updated_at = new Date().toISOString();
    writeMoodFile(data);

    return { cleanText, mood: newMood };
  }

  const current = resolveMood();
  return { cleanText: text, mood: current.current_mood };
}
