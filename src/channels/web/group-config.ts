/**
 * Group configuration loader — single source of truth for all group identity,
 * routing, and persona values. Replaces hardcoded constants across web channel files.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';

export interface GroupConfig {
  group_name: string;
  group_folder: string;
  group_jid: string;
  timezone: string;
  assistant: {
    name: string;
    trigger: string;
  };
  user: {
    name: string;
    sender_id: string;
  };
  contacts?: Record<string, string>; // phone number → display name
  features: {
    memory: boolean;
    diary: boolean;
    mood: boolean;
    emotional_state: boolean;
    schedule: boolean;
    personality: boolean;
    relationship: boolean;
    voice_call: boolean;
    tom: boolean;
    style_match: boolean;
    // Room Runtime feature flags (all default false — enable per-group)
    room_runtime: boolean; // master switch for pulse loop
    room_ingest: boolean; // pull from memories/diary/etc (Phase B)
    room_bleed: boolean; // whisper into chat (Phase D)
    room_outbound_queue: boolean; // allow queue→draft-watcher (Phase D)
    room_llm_actions: boolean; // enable Haiku actions (Phase C)
  };
}

const GROUPS_DIR = path.resolve(process.cwd(), 'groups');

let loaded: GroupConfig | null = null;

function resolveGroupFolder(): string {
  return process.env.NANOCLAW_WEB_GROUP || 'seyoung';
}

export function loadGroupConfig(folder?: string): GroupConfig {
  const groupFolder = folder || resolveGroupFolder();
  const configPath = path.join(GROUPS_DIR, groupFolder, 'group.json');

  const defaultFeatures = {
    memory: true,
    diary: true,
    mood: true,
    emotional_state: true,
    schedule: true,
    personality: true,
    relationship: true,
    voice_call: true,
    tom: true,
    style_match: true,
    // Room Runtime — all default false, enable per-group when ready
    room_runtime: false,
    room_ingest: false,
    room_bleed: false,
    room_outbound_queue: false,
    room_llm_actions: false,
  };

  const defaults: GroupConfig = {
    group_name: groupFolder,
    group_folder: groupFolder,
    group_jid: `web:${groupFolder}`,
    timezone: process.env.TZ || 'UTC',
    assistant: {
      name: groupFolder.charAt(0).toUpperCase() + groupFolder.slice(1),
      trigger: `@${groupFolder}`,
    },
    user: {
      name: 'User',
      sender_id: `web:user`,
    },
    features: { ...defaultFeatures },
  };

  if (!fs.existsSync(configPath)) {
    logger.warn({ configPath }, 'group.json not found, using defaults');
    loaded = { ...defaults };
    return loaded;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    loaded = {
      group_name: raw.group_name || defaults.group_name,
      group_folder: groupFolder,
      group_jid: raw.group_jid || defaults.group_jid,
      timezone: raw.timezone || defaults.timezone,
      assistant: {
        name: raw.assistant?.name || defaults.assistant.name,
        trigger: raw.assistant?.trigger || defaults.assistant.trigger,
      },
      user: {
        name: raw.user?.name || defaults.user.name,
        sender_id: raw.user?.sender_id || defaults.user.sender_id,
      },
      contacts: raw.contacts || undefined,
      features: { ...defaultFeatures, ...(raw.features || {}) },
    };
    logger.info(
      {
        group: loaded.group_folder,
        assistant: loaded.assistant.name,
        user: loaded.user.name,
      },
      'Group config loaded',
    );
    return loaded;
  } catch (err) {
    logger.error(
      { err, configPath },
      'Failed to parse group.json, using defaults',
    );
    loaded = { ...defaults };
    return loaded;
  }
}

/** Reload config from disk (for API updates) */
export function reloadGroupConfig(): GroupConfig {
  loaded = null;
  return loadGroupConfig();
}

/** Get the loaded config, loading it if necessary */
export function getGroupConfig(): GroupConfig {
  if (!loaded) return loadGroupConfig();
  return loaded;
}

// Convenience getters
export function getGroupFolder(): string {
  return getGroupConfig().group_folder;
}
export function getGroupJid(): string {
  return getGroupConfig().group_jid;
}
export function getTimezone(): string {
  return getGroupConfig().timezone;
}
export function getAssistantName(): string {
  return getGroupConfig().assistant.name;
}
export function getUserName(): string {
  return getGroupConfig().user.name;
}
export function getUserSenderId(): string {
  return getGroupConfig().user.sender_id;
}
export function getGroupDir(): string {
  return path.join(GROUPS_DIR, getGroupFolder());
}
export function isFeatureEnabled(
  feature: keyof GroupConfig['features'],
): boolean {
  return getGroupConfig().features[feature];
}
