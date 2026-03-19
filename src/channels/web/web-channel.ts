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
  runTaskNow?: (
    taskId: string,
  ) => Promise<{
    status: string;
    result: string | null;
    error: string | null;
    duration_ms: number;
  }>;
}

const GROUP_JID = 'web:seyoung';
const GROUP_FOLDER = 'seyoung';

export function createWebChannel(opts: WebChannelOpts): Channel | null {
  let webServer: WebServer | null = null;
  let connected = false;

  // Accumulate chunks for the current response
  let responseAccumulator = '';
  // Debounce timer: after last chunk, finalize the message
  let finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  const FINALIZE_DELAY = 2000; // 2s after last chunk → mark done

  function finalize() {
    if (webServer && responseAccumulator) {
      webServer.sendToClient(responseAccumulator, true);
      responseAccumulator = '';
    }
    // Clear typing indicator when response is finalized
    webServer?.setTyping(false);
    finalizeTimer = null;
  }

  function resetFinalizeTimer() {
    if (finalizeTimer) clearTimeout(finalizeTimer);
    finalizeTimer = setTimeout(finalize, FINALIZE_DELAY);
  }

  return {
    name: 'web',

    async connect(): Promise<void> {
      // Ensure group folder exists
      const groupDir = path.join(GROUPS_DIR, GROUP_FOLDER);
      fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
      fs.mkdirSync(path.join(groupDir, 'uploads'), { recursive: true });

      // Auto-register the seyoung group
      setRegisteredGroup(GROUP_JID, {
        name: 'Seyoung',
        folder: GROUP_FOLDER,
        trigger: '@Seyoung',
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        isMain: false,
      });

      // Store chat metadata
      storeChatMetadata(
        GROUP_JID,
        new Date().toISOString(),
        'Seyoung',
        'web',
        false,
      );

      // Start web server
      webServer = createWebServer({
        onMessage: opts.onMessage,
        getMessages: (sessionId?: string) =>
          getChatMessages(GROUP_JID, 20, sessionId),
        runTaskNow: opts.runTaskNow,
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

    async sendMessage(_jid: string, text: string): Promise<void> {
      if (!webServer) return;

      // Each sendMessage call is a chunk from the agent.
      // Accumulate and send as streaming chunks.
      responseAccumulator += (responseAccumulator ? '\n' : '') + text;
      webServer.sendToClient(responseAccumulator, false);

      // Reset debounce timer — finalize after no new chunks for 2s
      resetFinalizeTimer();
    },

    isConnected(): boolean {
      return connected;
    },

    ownsJid(jid: string): boolean {
      return jid.startsWith('web:');
    },

    async disconnect(): Promise<void> {
      if (finalizeTimer) clearTimeout(finalizeTimer);
      if (webServer) {
        webServer.close();
        webServer = null;
      }
      connected = false;
    },

    async setTyping(_jid: string, isTyping: boolean): Promise<void> {
      if (!webServer) return;
      if (isTyping) {
        // Reset accumulator when typing starts (new response)
        if (finalizeTimer) clearTimeout(finalizeTimer);
        responseAccumulator = '';
      } else {
        // Typing ended — finalize immediately if not already done
        if (finalizeTimer) clearTimeout(finalizeTimer);
        finalize();
      }
      webServer.setTyping(isTyping);
    },

    async setToolUse(
      _jid: string,
      tool: string,
      target?: string,
    ): Promise<void> {
      webServer?.setToolUse(tool, target);
    },

    getSessionKey(groupFolder: string): string {
      const webSessionId = webServer?.getCurrentSessionId() || 'default';
      return `${groupFolder}::${webSessionId}`;
    },
  };
}
