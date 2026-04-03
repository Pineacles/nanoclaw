import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from '../../config.js';
import {
  getChatMessages,
  setRegisteredGroup,
  storeChatMetadata,
  getTasksForGroup,
  createTask,
} from '../../db.js';
import { logger } from '../../logger.js';
import { computeNextRun } from '../../task-scheduler.js';
import crypto from 'crypto';
import { Channel } from '../../types.js';
import type { ChannelOpts } from '../registry.js';
import { createWebServer, WebServer } from './web-server.js';
import { loadGroupConfig, getGroupFolder, getGroupJid, getAssistantName, getGroupDir } from './group-config.js';

export interface WebChannelOpts extends ChannelOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTaskNow?: (
    taskId: string,
    onProgress?: (event: any) => void,
  ) => Promise<{
    status: string;
    result: string | null;
    error: string | null;
    duration_ms: number;
  }>;
  whatsappBridgeJid?: string;
  sendToWhatsApp?: (jid: string, text: string) => Promise<void>;
}

export function createWebChannel(opts: WebChannelOpts): Channel | null {
  let webServer: WebServer | null = null;
  let connected = false;

  // Per-session accumulators and finalize timers
  const accumulators = new Map<string, string>();
  const finalizeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const FINALIZE_DELAY = 2000; // 2s after last chunk → mark done

  function finalize(sid: string) {
    if (webServer && accumulators.has(sid)) {
      webServer.sendToClient(accumulators.get(sid)!, true, sid);
      accumulators.delete(sid);
    }
    webServer?.setTyping(false, sid);
    finalizeTimers.delete(sid);
  }

  function resetFinalizeTimer(sid: string) {
    const existing = finalizeTimers.get(sid);
    if (existing) clearTimeout(existing);
    finalizeTimers.set(
      sid,
      setTimeout(() => finalize(sid), FINALIZE_DELAY),
    );
  }

  return {
    name: 'web',

    async connect(): Promise<void> {
      // Load group config first — all other modules depend on it
      const config = loadGroupConfig();
      const groupFolder = config.group_folder;
      const groupJid = config.group_jid;
      const pipelineJid = opts.whatsappBridgeJid || groupJid;

      // Ensure group folder exists
      const groupDir = getGroupDir();
      fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
      fs.mkdirSync(path.join(groupDir, 'uploads'), { recursive: true });

      // Register the pipeline JID as the single group for all sessions
      setRegisteredGroup(pipelineJid, {
        name: config.assistant.name,
        folder: groupFolder,
        trigger: config.assistant.trigger,
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        isMain: false,
      });

      // Store chat metadata
      storeChatMetadata(
        pipelineJid,
        new Date().toISOString(),
        config.assistant.name,
        'web',
        false,
      );

      // Start web server
      webServer = createWebServer({
        onMessage: opts.onMessage,
        getMessages: (sessionId?: string) =>
          getChatMessages(pipelineJid, 5000, sessionId),
        runTaskNow: opts.runTaskNow,
        whatsappBridgeJid: opts.whatsappBridgeJid,
        sendToWhatsApp: opts.sendToWhatsApp,
      });

      // Create nightly mood planning task if not exists
      const existingTasks = getTasksForGroup(groupFolder);
      const hasMoodTask = existingTasks.some(
        (t) =>
          t.prompt.includes('mood schedule') &&
          (t.status === 'active' || t.status === 'draft'),
      );
      if (!hasMoodTask) {
        const moodTask = {
          id: crypto.randomUUID(),
          group_folder: groupFolder,
          chat_jid: groupJid,
          prompt:
            "It's almost midnight. Plan your full mood schedule for tomorrow in mood.json. Write realistic time slots for your whole day — your morning routine, breakfast, work/creative time, lunch, exercise, dinner, evening wind-down, and sleep. Assign a mood and energy level to each slot and describe the activity. Be honest about your energy levels at each time of day. Include eating slots for breakfast, lunch and dinner with eating mood.\n\nAlso generate a `daily_weights` block in mood.json that reflects your emotional tendencies for tomorrow. This controls the natural drift of your mood throughout the day. Format:\n```json\n\"daily_weights\": {\n  \"base\": {\"chill\": 0.3, \"focused\": 0.25, \"playful\": 0.2, \"soft\": 0.1, \"tired\": 0.15},\n  \"random_factor\": 0.12,\n  \"desired_override\": null\n}\n```\nThe `base` weights should add up to ~1.0 and reflect which moods are most likely tomorrow (only include moods that make sense for the day — skip sleeping/eating/training as those are scheduled). Set `random_factor` between 0.10-0.15 for natural unpredictability. Use `desired_override` (a mood name string) only if you specifically want to lean into a mood tomorrow, otherwise null.",
          schedule_type: 'cron' as const,
          schedule_value: '0 23 * * *',
          context_mode: 'group' as const,
          next_run: null as string | null,
          status: 'active' as const,
          created_at: new Date().toISOString(),
        };
        moodTask.next_run = computeNextRun(
          moodTask as Parameters<typeof computeNextRun>[0],
        );
        createTask(moodTask);
        logger.info(`Created nightly mood planning task for ${config.assistant.name}`);
      }

      connected = true;
      logger.info('Web channel connected');
    },

    async sendMessage(
      _jid: string,
      text: string,
      sessionId?: string,
    ): Promise<void> {
      if (!webServer) return;
      const sid = sessionId || 'default';
      const current = accumulators.get(sid) || '';
      accumulators.set(sid, current + (current ? '\n' : '') + text);
      webServer.sendToClient(accumulators.get(sid)!, false, sid);
      resetFinalizeTimer(sid);
    },

    isConnected(): boolean {
      return connected;
    },

    ownsJid(jid: string): boolean {
      return jid.startsWith('web:');
    },

    async disconnect(): Promise<void> {
      for (const timer of finalizeTimers.values()) clearTimeout(timer);
      finalizeTimers.clear();
      if (webServer) {
        webServer.close();
        webServer = null;
      }
      connected = false;
    },

    async setTyping(
      _jid: string,
      isTyping: boolean,
      sessionId?: string,
    ): Promise<void> {
      if (!webServer) return;
      const sid = sessionId || 'default';
      if (isTyping) {
        const timer = finalizeTimers.get(sid);
        if (timer) clearTimeout(timer);
        accumulators.delete(sid);
      } else {
        const timer = finalizeTimers.get(sid);
        if (timer) clearTimeout(timer);
        finalize(sid);
      }
      webServer.setTyping(isTyping, sid);
    },

    async setToolUse(
      _jid: string,
      tool: string,
      target?: string,
      sessionId?: string,
    ): Promise<void> {
      webServer?.setToolUse(tool, target, sessionId || 'default');
    },

    getSessionKey(groupFolder: string, sessionId?: string): string {
      const webSessionId = sessionId || 'default';
      return `${groupFolder}::${webSessionId}`;
    },

    injectBridgedMessage(
      senderName: string,
      content: string,
      images?: Buffer[],
    ): void {
      webServer?.injectBridgedMessage(senderName, content, images);
    },

    setQueued(sessionId: string, queued: boolean): void {
      webServer?.setQueued(sessionId, queued);
    },
  };
}
