import fs from 'fs';
import path from 'path';
import { GROUPS_DIR } from '../../config.js';

const GROUP_FOLDER = 'seyoung';
const OVERRIDE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export interface MoodScheduleSlot {
  time: string;
  mood: string;
  energy: number;
  activity: string;
}

export interface MoodData {
  current_mood: string;
  energy: number;
  updated_at: string;
  schedule: MoodScheduleSlot[];
}

export interface ResolvedMood {
  current_mood: string;
  energy: number;
  activity: string;
  updated_at: string;
  schedule: MoodScheduleSlot[];
}

function moodPath(): string {
  return path.join(GROUPS_DIR, GROUP_FOLDER, 'mood.json');
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
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function findActiveSlot(schedule: MoodScheduleSlot[]): MoodScheduleSlot | null {
  if (!schedule || schedule.length === 0) return null;
  const now = getZurichTimeStr(); // "HH:MM"
  let active: MoodScheduleSlot | null = null;
  for (const slot of schedule) {
    if (slot.time <= now) {
      active = slot;
    }
  }
  // If no slot matched (before first slot), wrap around to last slot (overnight)
  if (!active) {
    active = schedule[schedule.length - 1];
  }
  return active;
}

export function resolveMood(): ResolvedMood {
  const data = readMoodFile();

  // Check if manually overridden within the last 30 minutes
  if (data.updated_at) {
    const overrideAge = Date.now() - new Date(data.updated_at).getTime();
    if (overrideAge < OVERRIDE_WINDOW_MS && overrideAge >= 0) {
      // Use manual override as-is
      const slot = findActiveSlot(data.schedule);
      return {
        current_mood: data.current_mood,
        energy: data.energy,
        activity: slot?.activity || '',
        updated_at: data.updated_at,
        schedule: data.schedule,
      };
    }
  }

  // Resolve from schedule
  const slot = findActiveSlot(data.schedule);
  if (slot) {
    data.current_mood = slot.mood;
    data.energy = slot.energy;
    writeMoodFile(data);
    return {
      current_mood: slot.mood,
      energy: slot.energy,
      activity: slot.activity,
      updated_at: data.updated_at,
      schedule: data.schedule,
    };
  }

  return {
    current_mood: data.current_mood,
    energy: data.energy,
    activity: '',
    updated_at: data.updated_at,
    schedule: data.schedule,
  };
}

/**
 * Parse [mood:X] or [mood:X energy:Y] tags from bot text.
 * Returns the cleaned text and the new mood if found.
 * Updates mood.json immediately as a manual override.
 */
export function applyMoodTag(text: string): { cleanText: string; mood: string } {
  const match = text.match(/\[mood:(\w+)(?:\s+energy:(\d+))?\]/);
  if (!match) {
    const current = resolveMood();
    return { cleanText: text, mood: current.current_mood };
  }

  const newMood = match[1];
  const newEnergy = match[2] ? parseInt(match[2], 10) : undefined;
  const cleanText = text.replace(/\[mood:\w+(?:\s+energy:\d+)?\]\s*/g, '').trim();

  // Write override to mood.json
  const data = readMoodFile();
  data.current_mood = newMood;
  if (newEnergy !== undefined) data.energy = newEnergy;
  data.updated_at = new Date().toISOString();
  writeMoodFile(data);

  return { cleanText, mood: newMood };
}
