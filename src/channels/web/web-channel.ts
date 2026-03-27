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

const GROUP_JID = 'web:seyoung';
const GROUP_FOLDER = 'seyoung';

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

  const pipelineJid = opts.whatsappBridgeJid || GROUP_JID;

  return {
    name: 'web',

    async connect(): Promise<void> {
      // Ensure group folder exists
      const groupDir = path.join(GROUPS_DIR, GROUP_FOLDER);
      fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
      fs.mkdirSync(path.join(groupDir, 'uploads'), { recursive: true });

      // Register the pipeline JID as the single group for all sessions
      setRegisteredGroup(pipelineJid, {
        name: 'Seyoung',
        folder: GROUP_FOLDER,
        trigger: '@Seyoung',
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        isMain: false,
      });

      // Store chat metadata
      storeChatMetadata(
        pipelineJid,
        new Date().toISOString(),
        'Seyoung',
        'web',
        false,
      );

      // Start web server
      webServer = createWebServer({
        onMessage: opts.onMessage,
        getMessages: (sessionId?: string) =>
          getChatMessages(pipelineJid, 20, sessionId),
        runTaskNow: opts.runTaskNow,
        whatsappBridgeJid: opts.whatsappBridgeJid,
        sendToWhatsApp: opts.sendToWhatsApp,
      });

      // Create nightly mood planning task if not exists
      const existingTasks = getTasksForGroup(GROUP_FOLDER);
      const hasMoodTask = existingTasks.some(
        (t) =>
          t.prompt.includes('mood schedule') &&
          (t.status === 'active' || t.status === 'draft'),
      );
      if (!hasMoodTask) {
        const moodTask = {
          id: crypto.randomUUID(),
          group_folder: GROUP_FOLDER,
          chat_jid: GROUP_JID,
          prompt:
            "It's almost midnight. Plan your full mood schedule for tomorrow in mood.json. Write realistic time slots for your whole day — your morning routine, breakfast, commission work, lunch, bouldering or other exercise, dinner, evening wind-down, and sleep. Assign a mood and energy level to each slot and describe the activity. Be honest about your energy levels at each time of day. Include eating slots for breakfast, lunch and dinner with eating mood.",
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
        logger.info('Created nightly mood planning task for Seyoung');
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
        // Reset accumulator when typing starts (new response)
        const timer = finalizeTimers.get(sid);
        if (timer) clearTimeout(timer);
        accumulators.delete(sid);
      } else {
        // Typing ended — finalize immediately if not already done
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
