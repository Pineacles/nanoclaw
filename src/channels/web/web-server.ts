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
  getBotMessageCount,
  updateWebSession,
  getChatMessages,
} from '../../db.js';
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
  runTaskNow?: (
    taskId: string,
  ) => Promise<{
    status: string;
    result: string | null;
    error: string | null;
    duration_ms: number;
  }>;
}

export interface WebServer {
  server: http.Server;
  wss: WebSocketServer;
  sendToClient(text: string, done: boolean): void;
  setTyping(isTyping: boolean): void;
  setToolUse(tool: string, target?: string): void;
  getCurrentSessionId(): string;
  close(): void;
}

async function generateSessionTitle(
  sessionId: string,
  botResponse: string,
  broadcast: (msg: ServerMessage) => void,
): Promise<void> {
  try {
    // Get the first user message in this session
    const messages = getChatMessages(GROUP_JID, 5, sessionId);
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

export function createWebServer(opts: WebServerOpts): WebServer {
  const env = readEnvFile(['WEB_PORT']);
  const port = parseInt(env.WEB_PORT || '3003', 10);

  // Static file serving - look for built frontend
  const staticDir = path.resolve(process.cwd(), 'web-ui', 'dist');

  const server = http.createServer(async (req, res) => {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    );

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

  // Current streaming message state
  let currentMessageId: string | null = null;
  let currentSessionId: string | null = null;

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
          // Track session for the bot response
          const sessionId = msg.sessionId || 'default';
          currentSessionId = sessionId;

          // Resolve mood for context injection
          const mood = resolveMood();
          const moodLine = `Current mood: ${mood.current_mood} (energy ${mood.energy}/10)${mood.activity ? ` — currently: ${mood.activity}` : ''}`;
          const agentContent = `[System: Current time is ${zurichTime}. ${moodLine}. Chat session: ${sessionId}. Keep your responses specific to this conversation — do not reference or carry over context from other chat sessions.]\n${content}`;

          // Touch session updated_at
          touchWebSession(sessionId);

          // Store message with system note and current mood
          storeMessage({
            id: messageId,
            chat_jid: GROUP_JID,
            sender: 'web:michael',
            sender_name: 'Michael',
            content: agentContent,
            timestamp,
            is_from_me: false,
            is_bot_message: false,
            session_id: sessionId,
            mood: mood.current_mood,
          });

          // Deliver to NanoClaw pipeline
          opts.onMessage(GROUP_JID, {
            id: messageId,
            chat_jid: GROUP_JID,
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

  return {
    server,
    wss,
    sendToClient(text: string, done: boolean) {
      if (!currentMessageId) {
        currentMessageId = crypto.randomUUID();
      }

      // If no session set (task-triggered), use most recently updated session
      if (!currentSessionId) {
        const sessions = getWebSessions();
        if (sessions.length > 0) {
          currentSessionId = sessions[0].id;
        }
      }

      // Always strip mood tags from displayed text so they never flash during streaming
      const displayText = stripMoodTags(text);

      broadcast({
        type: 'message',
        id: currentMessageId,
        content: displayText,
        done,
      });

      if (done) {
        // Apply mood tag to mood.json and push update instantly via WebSocket
        const { cleanText, mood: tagMood } = applyMoodTag(text);
        const moodNow = resolveMood();
        broadcast({
          type: 'mood',
          current_mood: moodNow.current_mood,
          energy: moodNow.energy,
          activity: moodNow.activity,
        });

        const sessionId = currentSessionId ?? 'default';

        storeMessageDirect({
          id: currentMessageId,
          chat_jid: GROUP_JID,
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
        const botCount = getBotMessageCount(GROUP_JID, sessionId);
        if (botCount === 1) {
          generateSessionTitle(sessionId, cleanText, broadcast);
        }

        currentMessageId = null;
        currentSessionId = null;
      }
    },
    setTyping(isTyping: boolean) {
      broadcast({ type: 'typing', isTyping });
    },
    setToolUse(tool: string, target?: string) {
      broadcast({ type: 'tool_use', tool, target });
    },
    getCurrentSessionId() {
      return currentSessionId || 'default';
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
