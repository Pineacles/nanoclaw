import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  CREDENTIAL_PROXY_PORT,
  DEFAULT_TRIGGER,
  getTriggerPattern,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  MAX_MESSAGES_PER_PROMPT,
  POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import { startCredentialProxy } from './credential-proxy.js';
import './channels/index.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
  PROXY_BIND_HOST,
} from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  deleteSession,
  getAllTasks,
  getLastBotMessageTimestamp,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  getWebSessionById,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import {
  restoreRemoteControl,
  startRemoteControl,
  stopRemoteControl,
} from './remote-control.js';
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
import { startSessionCleanup } from './session-cleanup.js';
import {
  runTaskNow,
  startSchedulerLoop,
  SchedulerDependencies,
} from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import { stripMoodTags } from './channels/web/mood.js';
import { buildSystemAppend } from './channels/web/context-builder.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let whatsAppBridgeJid: string | null = null;
let messageLoopRunning = false;

const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

/**
 * Return the message cursor for a group, recovering from the last bot reply
 * if lastAgentTimestamp is missing (new group, corrupted state, restart).
 */
function getOrRecoverCursor(chatJid: string): string {
  const existing = lastAgentTimestamp[chatJid];
  if (existing) return existing;

  const botTs = getLastBotMessageTimestamp(chatJid, ASSISTANT_NAME);
  if (botTs) {
    logger.info(
      { chatJid, recoveredFrom: botTs },
      'Recovered message cursor from last bot reply',
    );
    lastAgentTimestamp[chatJid] = botTs;
    saveState();
    return botTs;
  }
  return '';
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // Copy CLAUDE.md template into the new group folder so agents have
  // identity and instructions from the first run.  (Fixes #1391)
  const groupMdFile = path.join(groupDir, 'CLAUDE.md');
  if (!fs.existsSync(groupMdFile)) {
    const templateFile = path.join(
      GROUPS_DIR,
      group.isMain ? 'main' : 'global',
      'CLAUDE.md',
    );
    if (fs.existsSync(templateFile)) {
      let content = fs.readFileSync(templateFile, 'utf-8');
      if (ASSISTANT_NAME !== 'Andy') {
        content = content.replace(/^# Andy$/m, `# ${ASSISTANT_NAME}`);
        content = content.replace(/You are Andy/g, `You are ${ASSISTANT_NAME}`);
      }
      fs.writeFileSync(groupMdFile, content);
      logger.info({ folder: group.folder }, 'Created CLAUDE.md from template');
    }
  }

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  const allMissedMessages = getMessagesSince(
    chatJid,
    getOrRecoverCursor(chatJid),
    ASSISTANT_NAME,
    MAX_MESSAGES_PER_PROMPT,
  );

  if (allMissedMessages.length === 0) return true;

  // Group messages by session — process one session at a time so responses
  // go to the right place and don't interleave across sessions.
  const sessionGroups = new Map<string, typeof allMissedMessages>();
  for (const msg of allMissedMessages) {
    const sid = msg.session_id || 'default';
    const existing = sessionGroups.get(sid);
    if (existing) existing.push(msg);
    else sessionGroups.set(sid, [msg]);
  }

  // Pick the first session (earliest message) to process now.
  // Advance cursor only past THIS session's messages so the rest
  // get picked up in the next poll cycle.
  const [sessionId, missedMessages] = sessionGroups.entries().next().value as [
    string,
    typeof allMissedMessages,
  ];

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const triggerPattern = getTriggerPattern(group.trigger);
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = missedMessages.some(
      (m) =>
        triggerPattern.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) {
      // Advance cursor past this session's messages so we don't re-check them
      lastAgentTimestamp[chatJid] =
        missedMessages[missedMessages.length - 1].timestamp;
      saveState();
      // Re-enqueue if other sessions have messages
      if (sessionGroups.size > 1) queue.enqueueMessageCheck(chatJid);
      return true;
    }
  }

  const prompt = formatMessages(missedMessages, TIMEZONE);

  // Advance cursor past this session's messages only.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, sessionId, messageCount: missedMessages.length },
    'Processing messages',
  );

  const webChannel = channels.find((c) => c.name === 'web');
  const waChannel = channels.find((c) => c.name === 'whatsapp');
  const isWhatsAppSession = sessionId === 'whatsapp';

  // If other sessions have pending messages, mark them as queued and re-enqueue
  if (sessionGroups.size > 1) {
    for (const [sid] of sessionGroups) {
      if (sid !== sessionId) {
        webChannel?.setQueued?.(sid, true);
      }
    }
    queue.enqueueMessageCheck(chatJid);
  }

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  // Always set typing on web channel (all sessions go through the web UI)
  await webChannel?.setTyping?.(chatJid, true, sessionId);
  // Also set typing on WhatsApp for WhatsApp-originated sessions
  if (isWhatsAppSession) await waChannel?.setTyping?.(chatJid, true);

  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(
    group,
    prompt,
    chatJid,
    async (result) => {
      // Tool use events — forward to web channel for real-time status
      if (result.toolUse) {
        logger.debug(
          { tool: result.toolUse.tool, target: result.toolUse.target },
          'Forwarding tool use to channel',
        );
        await webChannel?.setToolUse?.(
          chatJid,
          result.toolUse.tool,
          result.toolUse.target,
          sessionId,
        );
      }

      // Streaming output callback — called for each agent result
      if (result.result) {
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
        // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
        let text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();

        // Suppress raw API errors from reaching the user and mark as error for retry
        if (
          /overloaded_error|"type"\s*:\s*"error"|API Error|rate_limit_error|server_error/.test(
            text,
          )
        ) {
          logger.warn(
            { group: group.name, raw: text.slice(0, 300) },
            'Suppressed API error from user output',
          );
          text = '';
          hadError = true;
        }

        logger.info(
          { group: group.name },
          `Agent output: ${raw.slice(0, 200)}`,
        );
        if (text) {
          // Always send to web UI (all sessions stream through it)
          await webChannel?.sendMessage(chatJid, text, sessionId);
          // Also send to WhatsApp for WhatsApp-originated sessions (strip mood tags)
          if (isWhatsAppSession && waChannel) {
            await waChannel.sendMessage(chatJid, stripMoodTags(text));
          }
          outputSentToUser = true;
        }
        // Only reset idle timer on actual results, not session-update markers (result: null)
        resetIdleTimer();
      }

      if (result.status === 'success' && !result.toolUse) {
        queue.notifyIdle(chatJid);
        // Write close sentinel directly to end the container's IPC wait loop.
        // Must happen here (inside the streaming callback) because runAgent
        // won't return until the container exits — writing after would deadlock.
        const ipcDir = path.join(
          process.cwd(),
          'data',
          'ipc',
          group.folder,
          'input',
        );
        try {
          fs.mkdirSync(ipcDir, { recursive: true });
          fs.writeFileSync(path.join(ipcDir, '_close'), '');
        } catch {
          /* ignore */
        }
      }

      if (result.status === 'error') {
        hadError = true;
      }
    },
    channel,
    sessionId,
  );

  await webChannel?.setTyping?.(chatJid, false, sessionId);
  if (isWhatsAppSession) await waChannel?.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  channel?: Channel,
  sessionId?: string,
): Promise<'success' | 'error'> {
  const isMain = group.isMain === true;
  const webChannel = channels.find((c) => c.name === 'web');
  const sessionKey =
    webChannel?.getSessionKey?.(group.folder, sessionId) ?? group.folder;
  const sdkSessionId = sessions[sessionKey];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      script: t.script || undefined,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[sessionKey] = output.newSessionId;
          setSession(sessionKey, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    // Check session mode — plain sessions skip identity/persona
    const webSession = getWebSessionById(sessionId || 'default');
    const isPlainMode = webSession?.mode === 'plain';

    // Compute systemAppend for the web channel (heavy persona/state context),
    // unless this is a plain-mode session which skips identity entirely.
    let systemInstruction: string | undefined;
    if (channel?.name === 'web' && !isPlainMode) {
      try {
        systemInstruction = buildSystemAppend({
          sessionId: sessionId || 'default',
          groupFolder: group.folder,
          chatJid,
        });
      } catch (err) {
        logger.warn(
          { err, group: group.name },
          'Failed to build systemAppend, continuing without it',
        );
      }
    }

    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId: sdkSessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
        skipIdentity: isPlainMode,
        systemInstruction,
      },
      (proc, containerName) =>
        queue.registerProcess(chatJid, proc, containerName, group.folder),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[sessionKey] = output.newSessionId;
      setSession(sessionKey, output.newSessionId);
    }

    if (output.status === 'error') {
      // Detect stale/corrupt session — clear it so the next retry starts fresh.
      // The session .jsonl can go missing after a crash mid-write, manual
      // deletion, or disk-full. The existing backoff in group-queue.ts
      // handles the retry; we just need to remove the broken session ID.
      const isStaleSession =
        sessionId &&
        output.error &&
        /no conversation found|ENOENT.*\.jsonl|session.*not found/i.test(
          output.error,
        );

      if (isStaleSession) {
        logger.warn(
          { group: group.name, staleSessionId: sessionId, error: output.error },
          'Stale session detected — clearing for next retry',
        );
        delete sessions[group.folder];
        deleteSession(group.folder);
      }

      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (default trigger: ${DEFAULT_TRIGGER})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
            continue;
          }

          const isMainGroup = group.isMain === true;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const triggerPattern = getTriggerPattern(group.trigger);
            const allowlistCfg = loadSenderAllowlist();
            const hasTrigger = groupMessages.some(
              (m) =>
                triggerPattern.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!hasTrigger) continue;
          }

          // Don't pipe cross-session messages into a running container.
          // Just enqueue — processGroupMessages will handle session grouping.
          queue.enqueueMessageCheck(chatJid);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const pending = getMessagesSince(
      chatJid,
      getOrRecoverCursor(chatJid),
      ASSISTANT_NAME,
      MAX_MESSAGES_PER_PROMPT,
    );
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();
  restoreRemoteControl();

  // Start credential proxy (containers route API calls through this)
  const proxyServer = await startCredentialProxy(
    CREDENTIAL_PROXY_PORT,
    PROXY_BIND_HOST,
  );

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    proxyServer.close();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle /remote-control and /remote-control-end commands
  async function handleRemoteControl(
    command: string,
    chatJid: string,
    msg: NewMessage,
  ): Promise<void> {
    const group = registeredGroups[chatJid];
    if (!group?.isMain) {
      logger.warn(
        { chatJid, sender: msg.sender },
        'Remote control rejected: not main group',
      );
      return;
    }

    const channel = findChannel(channels, chatJid);
    if (!channel) return;

    if (command === '/remote-control') {
      const result = await startRemoteControl(
        msg.sender,
        chatJid,
        process.cwd(),
      );
      if (result.ok) {
        await channel.sendMessage(chatJid, result.url);
      } else {
        await channel.sendMessage(
          chatJid,
          `Remote Control failed: ${result.error}`,
        );
      }
    } else {
      const result = stopRemoteControl();
      if (result.ok) {
        await channel.sendMessage(chatJid, 'Remote Control session ended.');
      } else {
        await channel.sendMessage(chatJid, result.error);
      }
    }
  }

  // Build scheduler deps early so runTaskNow can be passed to channels.
  // sendMessage uses a late-binding closure over `channels` (populated below).
  const schedulerDeps: SchedulerDependencies = {
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
  };

  // WhatsApp bridge: messages from this JID get tunneled through the web UI pipeline.
  const WHATSAPP_BRIDGE_JID = '41798463996@s.whatsapp.net';
  // eslint-disable-next-line @typescript-eslint/no-use-before-define -- late-bound
  whatsAppBridgeJid = WHATSAPP_BRIDGE_JID;

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    runTaskNow: (
      taskId: string,
      onProgress?: Parameters<typeof runTaskNow>[2],
    ) => runTaskNow(taskId, schedulerDeps, onProgress),
    // WhatsApp bridge wiring — late-bound since channels aren't connected yet
    whatsappBridgeJid: WHATSAPP_BRIDGE_JID,
    sendToWhatsApp: async (jid: string, text: string) => {
      const waChannel = channels.find((c) => c.name === 'whatsapp');
      if (waChannel) {
        await waChannel.sendMessage(jid, text);
      }
    },
    onBridgeMessage: (
      senderName: string,
      content: string,
      images?: Buffer[],
    ) => {
      const webChannel = channels.find((c) => c.name === 'web');
      if (webChannel?.injectBridgedMessage) {
        webChannel.injectBridgedMessage(senderName, content, images);
      }
    },
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Remote control commands — intercept before storage
      const trimmed = msg.content.trim();
      if (trimmed === '/remote-control' || trimmed === '/remote-control-end') {
        handleRemoteControl(trimmed, chatJid, msg).catch((err) =>
          logger.error({ err, chatJid }, 'Remote control command error'),
        );
        return;
      }

      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Reload registered groups — channels may have registered new groups during connect()
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'Groups reloaded after channel connect',
  );

  // Start subsystems (independently of connection handler)
  startSchedulerLoop(schedulerDeps);
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    sendMedia: (jid, media) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      if (!channel.sendMedia)
        throw new Error(`Channel ${channel.name} does not support media`);
      return channel.sendMedia(
        jid,
        media.filePath,
        media.caption,
        media.voiceNote,
      );
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
    onTasksChanged: () => {
      const tasks = getAllTasks();
      const taskRows = tasks.map((t) => ({
        id: t.id,
        groupFolder: t.group_folder,
        prompt: t.prompt,
        script: t.script || undefined,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
      }));
      for (const group of Object.values(registeredGroups)) {
        writeTasksSnapshot(group.folder, group.isMain === true, taskRows);
      }
    },
  });
  startSessionCleanup();
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
