import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

import { readEnvFile } from '../../env.js';
import { logger } from '../../logger.js';
import {
  storeMessage,
  storeMessageDirect,
  touchWebSession,
  getWebSessions,
  getWebSessionById,
  createWebSession,
  getBotMessageCount,
  updateWebSession,
  getChatMessages,
  queryChatMessages,
} from '../../db.js';
import {
  saveMemory,
  searchMemories,
  getMemoryById,
  getRecentMemories,
  consolidateMemories,
  getMemoryStats,
} from '../../memory-db.js';
import { resolveMood, applyMoodTag, stripMoodTags } from './mood.js';
import { verifyAuth } from './auth.js';
import { handleApiRoute, ApiDeps } from './api-routes.js';
import type { ClientMessage, ServerMessage } from './types.js';
import type { OnInboundMessage } from '../../types.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const GROUP_JID = 'web:seyoung';

export interface WebServerOpts {
  onMessage: OnInboundMessage;
  getMessages: (sessionId?: string) => ReturnType<ApiDeps['getMessages']>;
  runTaskNow?: (taskId: string, onProgress?: (event: import('./api-routes.js').TaskProgressEvent) => void) => Promise<{
    status: string;
    result: string | null;
    error: string | null;
    duration_ms: number;
  }>;
  whatsappBridgeJid?: string;
  sendToWhatsApp?: (jid: string, text: string) => Promise<void>;
}

export interface WebServer {
  server: http.Server;
  wss: WebSocketServer;
  sendToClient(text: string, done: boolean, sessionId: string): void;
  injectBridgedMessage(senderName: string, content: string, images?: Buffer[]): void;
  setTyping(isTyping: boolean, sessionId: string): void;
  setToolUse(tool: string, target?: string, sessionId?: string): void;
  setQueued(sessionId: string, queued: boolean): void;
  close(): void;
}

async function generateSessionTitle(
  sessionId: string,
  botResponse: string,
  broadcast: (msg: ServerMessage) => void,
  pipelineJid: string,
): Promise<void> {
  try {
    // Get the first user message in this session
    const messages = getChatMessages(pipelineJid, 5, sessionId);
    const firstUserMsg = messages.find((m) => m.is_bot_message === 0);
    if (!firstUserMsg) return;

    const userText = firstUserMsg.content.replace(/^\[System: [^\]]+\]\n/, '');

    const prompt = `Generate a 3-5 word title for this conversation. Return ONLY the title, nothing else. No quotes, no punctuation.\n\nUser: ${userText.slice(0, 300)}\nAssistant: ${botResponse.slice(0, 300)}`;

    const { spawn } = await import('child_process');

    const stdout = await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        'claude',
        ['--print', '--model', 'claude-haiku-4-5-20251001'],
        {
          timeout: 30000,
          env: {
            ...process.env,
            PATH:
              process.env.PATH +
              ':/home/pineappleles/.nvm/versions/node/v22.22.1/bin',
          },
        },
      );
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => {
        out += d.toString();
      });
      proc.stderr.on('data', (d: Buffer) => {
        err += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`claude exit ${code}: ${err}`));
      });
      proc.on('error', reject);
      proc.stdin.write(prompt);
      proc.stdin.end();
    });

    const title = stdout.trim();
    if (!title || title.length > 60) return;

    updateWebSession(sessionId, title);
    broadcast({ type: 'session_renamed', sessionId, name: title });
  } catch (err) {
    logger.error({ err }, 'Failed to generate session title');
  }
}

const WHATSAPP_SESSION_ID = 'whatsapp';
const GROUP_FOLDER = 'seyoung';

/**
 * Build a compact memory context string for injection into agent prompts.
 * Reads the latest diary entry and a few recent memories to give the agent
 * a sense of continuity without bloating the context.
 */
function buildMemoryContext(): string {
  const parts: string[] = [];

  // Last diary entry — check if one exists from yesterday or today
  try {
    const diaryDir = path.join(
      process.cwd(),
      'groups',
      GROUP_FOLDER,
      'diary',
    );
    if (fs.existsSync(diaryDir)) {
      const entries = fs.readdirSync(diaryDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse();
      if (entries.length > 0) {
        const latest = fs.readFileSync(path.join(diaryDir, entries[0]), 'utf-8').trim();
        // Take first 300 chars of the diary as a summary
        const snippet = latest.length > 300 ? latest.slice(0, 300) + '...' : latest;
        parts.push(`Last diary (${entries[0].replace('.md', '')}): ${snippet}`);
      }
    }
  } catch {
    // Diary not available, skip
  }

  // Recent memories — top 5 most important active memories
  try {
    const recent = getRecentMemories({ group_folder: GROUP_FOLDER, limit: 5 });
    if (recent.length > 0) {
      const memLines = recent
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
        .map((m) => `  - [${m.category}] ${m.content.slice(0, 100)}`);
      parts.push(`Recent memories:\n${memLines.join('\n')}`);
    }
  } catch {
    // Memory DB not available, skip
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

function internalJson(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readInternalBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

async function handleInternalRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  const method = req.method || 'GET';

  // --- Chat query ---
  if (p === '/internal/chat-query' && method === 'GET') {
    const groupFolder = url.searchParams.get('group_folder');
    if (!groupFolder) return internalJson(res, { error: 'group_folder is required' }, 400), true;

    const rows = queryChatMessages({
      groupFolder,
      limit: parseInt(url.searchParams.get('limit') || '20', 10),
      source: url.searchParams.get('source') || 'all',
      since: url.searchParams.get('since') || undefined,
      sender: url.searchParams.get('sender') || undefined,
    });
    return internalJson(res, rows), true;
  }

  // --- Memory save ---
  if (p === '/internal/memory-save' && method === 'POST') {
    const body = JSON.parse(await readInternalBody(req));
    if (!body.group_folder || !body.content) {
      return internalJson(res, { error: 'group_folder and content are required' }, 400), true;
    }
    const id = saveMemory({
      group_folder: body.group_folder,
      content: body.content,
      category: body.category,
      importance: body.importance,
      tags: body.tags,
      source: body.source,
    });
    return internalJson(res, { id }), true;
  }

  // --- Memory search ---
  if (p === '/internal/memory-search' && method === 'GET') {
    const groupFolder = url.searchParams.get('group_folder');
    const query = url.searchParams.get('q');
    if (!groupFolder || !query) {
      return internalJson(res, { error: 'group_folder and q are required' }, 400), true;
    }
    const results = searchMemories({
      group_folder: groupFolder,
      query,
      category: url.searchParams.get('category') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '10', 10),
    });
    return internalJson(res, results), true;
  }

  // --- Memory get by ID ---
  if (p === '/internal/memory-get' && method === 'GET') {
    const groupFolder = url.searchParams.get('group_folder');
    const id = url.searchParams.get('id');
    if (!groupFolder || !id) {
      return internalJson(res, { error: 'group_folder and id are required' }, 400), true;
    }
    const memory = getMemoryById(groupFolder, id);
    if (!memory) return internalJson(res, { error: 'Not found' }, 404), true;
    return internalJson(res, memory), true;
  }

  // --- Recent memories ---
  if (p === '/internal/memory-recent' && method === 'GET') {
    const groupFolder = url.searchParams.get('group_folder');
    if (!groupFolder) {
      return internalJson(res, { error: 'group_folder is required' }, 400), true;
    }
    const memories = getRecentMemories({
      group_folder: groupFolder,
      limit: parseInt(url.searchParams.get('limit') || '20', 10),
      since: url.searchParams.get('since') || undefined,
    });
    return internalJson(res, memories), true;
  }

  // --- Memory stats ---
  if (p === '/internal/memory-stats' && method === 'GET') {
    const groupFolder = url.searchParams.get('group_folder');
    if (!groupFolder) {
      return internalJson(res, { error: 'group_folder is required' }, 400), true;
    }
    return internalJson(res, getMemoryStats(groupFolder)), true;
  }

  // --- Memory consolidation ---
  if (p === '/internal/memory-consolidate' && method === 'POST') {
    const body = JSON.parse(await readInternalBody(req));
    if (!body.group_folder) {
      return internalJson(res, { error: 'group_folder is required' }, 400), true;
    }
    const count = consolidateMemories(body.group_folder, {
      olderThanDays: body.older_than_days,
      maxAccessCount: body.max_access_count,
      maxImportance: body.max_importance,
    });
    return internalJson(res, { archived: count }), true;
  }

  return false;
}

export function createWebServer(opts: WebServerOpts): WebServer {
  const env = readEnvFile(['WEB_PORT']);
  const port = parseInt(env.WEB_PORT || '3003', 10);

  // Ensure the permanent WhatsApp session exists
  if (opts.whatsappBridgeJid) {
    const existing = getWebSessionById(WHATSAPP_SESSION_ID);
    if (!existing) {
      createWebSession(WHATSAPP_SESSION_ID, 'WhatsApp');
    }
  }

  // Static file serving - look for built frontend
  const staticDir = path.resolve(process.cwd(), 'web-ui', 'dist');

  const server = http.createServer(async (req, res) => {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    );

    // Internal API — no auth, localhost/container network only
    if (url.pathname.startsWith('/internal/')) {
      const sourceIp = req.socket.remoteAddress || '';
      const isLocal =
        sourceIp === '127.0.0.1' ||
        sourceIp === '::1' ||
        sourceIp === '::ffff:127.0.0.1' ||
        sourceIp.startsWith('172.') ||
        sourceIp.startsWith('::ffff:172.');
      if (!isLocal) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      const handled = await handleInternalRoute(req, res, url);
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // CORS for API routes
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      );

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (!verifyAuth(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const handled = await handleApiRoute(req, res, url, {
        getMessages: opts.getMessages,
        runTaskNow: opts.runTaskNow,
        broadcast: (msg: unknown) => broadcast(msg as ServerMessage),
      });
      if (handled) return;

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Static file serving
    serveStatic(res, url.pathname, staticDir);
  });

  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade with auth
  server.on('upgrade', (req, socket, head) => {
    if (!verifyAuth(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  // Track active connections
  const clients = new Set<WebSocket>();

  // Per-session streaming message state
  const sessionMessageIds = new Map<string, string>();

  // Per-session live state — survives client reconnects
  interface SessionState {
    typing: boolean;
    tool: { tool: string; target?: string } | null;
    messageId: string | null;
    content: string | null;
    queued: boolean;
  }
  const sessionStates = new Map<string, SessionState>();

  function getSessionState(sid: string): SessionState {
    let state = sessionStates.get(sid);
    if (!state) {
      state = { typing: false, tool: null, messageId: null, content: null, queued: false };
      sessionStates.set(sid, state);
    }
    return state;
  }

  function sendSessionState(ws: WebSocket, sid: string): void {
    const state = getSessionState(sid);
    send(ws, {
      type: 'session_state',
      sessionId: sid,
      typing: state.typing,
      tool: state.tool,
      messageId: state.messageId,
      content: state.content,
      queued: state.queued,
    });
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    send(ws, { type: 'connected' });
    logger.info('Web UI client connected');

    ws.on('message', (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());

        if (msg.type === 'ping') {
          send(ws, { type: 'pong' });
          return;
        }

        if (msg.type === 'get_session_state') {
          sendSessionState(ws, msg.sessionId);
          return;
        }

        if (msg.type === 'chat') {
          let content = msg.content;

          // Handle images: save base64 data and append path references
          if (msg.images && msg.images.length > 0) {
            const uploadsDir = path.resolve(
              process.cwd(),
              'groups',
              'seyoung',
              'uploads',
            );
            fs.mkdirSync(uploadsDir, { recursive: true });

            for (const dataUri of msg.images) {
              const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
              if (!matches) continue;
              const ext = matches[1].split('/')[1] || 'png';
              const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
              const buffer = Buffer.from(matches[2], 'base64');
              fs.writeFileSync(path.join(uploadsDir, filename), buffer);
              content += `\n[Image: /workspace/group/uploads/${filename}]`;
            }
          }

          const messageId = crypto.randomUUID();
          const timestamp = new Date().toISOString();

          // Prepend current date/time for the agent (invisible to UI)
          const zurichTime = new Date().toLocaleString('en-GB', {
            timeZone: 'Europe/Zurich',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          });
          const sessionId = msg.sessionId || 'default';

          // Resolve mood and memory for context injection
          const mood = resolveMood();
          const moodLine = `Current mood: ${mood.current_mood} (energy ${mood.energy}/10)${mood.activity ? ` — currently: ${mood.activity}` : ''}`;
          const memoryContext = buildMemoryContext();
          const agentContent = `[System: Current time is ${zurichTime}. ${moodLine}. Chat session: ${sessionId}. Keep your responses specific to this conversation — do not reference or carry over context from other chat sessions.${memoryContext}]\n${content}`;

          // Touch session updated_at
          touchWebSession(sessionId);

          // When WhatsApp bridge is active, route through the bridge JID
          // so messages land in the registered group (WhatsApp owns the
          // seyoung folder registration in bridge mode).
          const pipelineJid = opts.whatsappBridgeJid || GROUP_JID;

          // Store under the pipeline JID so messages are found by the message loop
          storeMessage({
            id: messageId,
            chat_jid: pipelineJid,
            sender: 'web:michael',
            sender_name: 'Michael',
            content: agentContent,
            timestamp,
            is_from_me: false,
            is_bot_message: false,
            session_id: sessionId,
            mood: mood.current_mood,
          });

          // Check if another session is busy — if so, mark this one as queued
          for (const [sid, state] of sessionStates) {
            if (sid !== sessionId && state.typing) {
              const myState = getSessionState(sessionId);
              myState.queued = true;
              send(ws, {
                type: 'session_state',
                sessionId,
                typing: false,
                tool: null,
                messageId: null,
                content: null,
                queued: true,
              });
              break;
            }
          }

          // Deliver to NanoClaw pipeline
          opts.onMessage(pipelineJid, {
            id: messageId,
            chat_jid: pipelineJid,
            sender: 'web:michael',
            sender_name: 'Michael',
            content: agentContent,
            timestamp,
            mood: mood.current_mood,
            session_id: sessionId,
          });
        }
      } catch (err) {
        logger.error({ err }, 'Error processing WebSocket message');
        send(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('Web UI client disconnected');
    });
  });

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcast(msg: ServerMessage): void {
    for (const ws of clients) {
      send(ws, msg);
    }
  }

  server.listen(port, () => {
    logger.info({ port }, 'Web UI server listening');
  });

  const pipelineJid = opts.whatsappBridgeJid || GROUP_JID;

  return {
    server,
    wss,
    sendToClient(text: string, done: boolean, sessionId: string) {
      let messageId = sessionMessageIds.get(sessionId);
      if (!messageId) {
        messageId = crypto.randomUUID();
        sessionMessageIds.set(sessionId, messageId);
      }

      // Always strip mood tags from displayed text so they never flash during streaming
      const displayText = stripMoodTags(text);

      // Update persistent session state
      const state = getSessionState(sessionId);
      state.messageId = messageId;
      state.content = displayText;

      if (!done) {
        // Streaming update — no mood yet
        broadcast({
          type: 'message',
          id: messageId,
          content: displayText,
          done: false,
          sessionId,
        });
      } else {
        // Apply mood tag to mood.json and push update instantly via WebSocket
        const { cleanText, mood: tagMood } = applyMoodTag(text);
        const moodNow = resolveMood();

        // Send final message with mood so the bubble gets the right color
        broadcast({
          type: 'message',
          id: messageId,
          content: cleanText,
          done: true,
          sessionId,
          mood: tagMood,
        });

        broadcast({
          type: 'mood',
          current_mood: moodNow.current_mood,
          energy: moodNow.energy,
          activity: moodNow.activity,
        });

        storeMessageDirect({
          id: messageId,
          chat_jid: pipelineJid,
          sender: 'bot',
          sender_name: 'Seyoung',
          content: cleanText,
          timestamp: new Date().toISOString(),
          is_from_me: true,
          is_bot_message: true,
          session_id: sessionId,
          mood: tagMood,
        });

        // Auto-name session after first bot response
        const botCount = getBotMessageCount(pipelineJid, sessionId);
        if (botCount === 1) {
          generateSessionTitle(sessionId, cleanText, broadcast, pipelineJid);
        }

        sessionMessageIds.delete(sessionId);

        // Clear session state — response is done
        state.typing = false;
        state.tool = null;
        state.messageId = null;
        state.content = null;
        state.queued = false;
      }
    },
    setTyping(isTyping: boolean, sessionId: string) {
      const state = getSessionState(sessionId);
      state.typing = isTyping;
      if (isTyping && state.queued) {
        // Session is no longer queued — it's being processed now
        state.queued = false;
        broadcast({ type: 'session_state', sessionId, typing: true, tool: null, messageId: null, content: null, queued: false });
      }
      if (!isTyping) {
        state.tool = null;
      }
      broadcast({ type: 'typing', isTyping, sessionId });
    },
    setToolUse(tool: string, target?: string, sessionId?: string) {
      if (sessionId) {
        const state = getSessionState(sessionId);
        state.tool = { tool, target };
      }
      broadcast({ type: 'tool_use', tool, target, sessionId });
    },
    setQueued(sessionId: string, queued: boolean) {
      const state = getSessionState(sessionId);
      state.queued = queued;
      broadcast({
        type: 'session_state',
        sessionId,
        typing: state.typing,
        tool: state.tool,
        messageId: state.messageId,
        content: state.content,
        queued,
      });
    },
    /**
     * Inject a message from WhatsApp into the web UI chat pipeline.
     * Stores the message, pushes it to WebSocket clients, and triggers the agent.
     */
    injectBridgedMessage(senderName: string, content: string, images?: Buffer[]) {
      const messageId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const sessionId = WHATSAPP_SESSION_ID;

      let fullContent = content;

      // Save images to uploads and append references
      if (images && images.length > 0) {
        const uploadsDir = path.resolve(process.cwd(), 'groups', 'seyoung', 'uploads');
        fs.mkdirSync(uploadsDir, { recursive: true });
        for (const buf of images) {
          const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.jpg`;
          fs.writeFileSync(path.join(uploadsDir, filename), buf);
          fullContent += `\n[Image: /workspace/group/uploads/${filename}]`;
        }
      }

      // Prepend system context (same as web UI messages)
      const zurichTime = new Date().toLocaleString('en-GB', {
        timeZone: 'Europe/Zurich',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
      const mood = resolveMood();
      const moodLine = `Current mood: ${mood.current_mood} (energy ${mood.energy}/10)${mood.activity ? ` — currently: ${mood.activity}` : ''}`;
      const memoryContext = buildMemoryContext();
      const agentContent = `[System: Current time is ${zurichTime}. ${moodLine}. Source: WhatsApp.${memoryContext}]\n${fullContent}`;

      touchWebSession(sessionId);

      // Store under pipeline JID so messages are found by the message loop
      storeMessage({
        id: messageId,
        chat_jid: pipelineJid,
        sender: 'whatsapp:user',
        sender_name: senderName,
        content: agentContent,
        timestamp,
        is_from_me: false,
        is_bot_message: false,
        session_id: sessionId,
        mood: mood.current_mood,
      });

      // Push to WebSocket so web UI sees it immediately
      broadcast({
        type: 'new_user_message',
        id: messageId,
        sender_name: senderName,
        content: fullContent,
        timestamp,
        sessionId: WHATSAPP_SESSION_ID,
      });

      // Check if another session is busy — if so, mark this one as queued
      for (const [sid, state] of sessionStates) {
        if (sid !== sessionId && state.typing) {
          const myState = getSessionState(sessionId);
          myState.queued = true;
          broadcast({
            type: 'session_state',
            sessionId,
            typing: false,
            tool: null,
            messageId: null,
            content: null,
            queued: true,
          });
          break;
        }
      }

      // Trigger agent pipeline using the pipeline JID (which is the registered group)
      opts.onMessage(pipelineJid, {
        id: messageId,
        chat_jid: pipelineJid,
        sender: 'whatsapp:user',
        sender_name: senderName,
        content: agentContent,
        timestamp,
        mood: mood.current_mood,
        session_id: sessionId,
      });
    },
    close() {
      for (const ws of clients) ws.close();
      wss.close();
      server.close();
    },
  };
}

function serveStatic(
  res: http.ServerResponse,
  pathname: string,
  staticDir: string,
): void {
  // Default to index.html for SPA routing
  let filePath = path.join(
    staticDir,
    pathname === '/' ? 'index.html' : pathname,
  );

  // Security: prevent path traversal
  if (!filePath.startsWith(staticDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // If file doesn't exist, serve index.html (SPA fallback)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(staticDir, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found - build the web UI first (npm run build:web)');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}
