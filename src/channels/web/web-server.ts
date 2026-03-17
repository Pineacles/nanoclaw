import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

import { readEnvFile } from '../../env.js';
import { logger } from '../../logger.js';
import { storeMessage, storeMessageDirect, touchWebSession } from '../../db.js';
import { resolveMood, applyMoodTag } from './mood.js';
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

export function createWebServer(opts: WebServerOpts): WebServer {
  const env = readEnvFile(['WEB_PORT']);
  const port = parseInt(env.WEB_PORT || '3003', 10);

  // Static file serving - look for built frontend
  const staticDir = path.resolve(process.cwd(), 'web-ui', 'dist');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // CORS for API routes
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

      // Always strip mood tags from displayed text so they never flash during streaming
      const displayText = text.replace(/\[mood:\w+(?:\s+energy:\d+)?\]\s*/g, '').trim();

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

        storeMessageDirect({
          id: currentMessageId,
          chat_jid: GROUP_JID,
          sender: 'bot',
          sender_name: 'Seyoung',
          content: cleanText,
          timestamp: new Date().toISOString(),
          is_from_me: true,
          is_bot_message: true,
          session_id: currentSessionId ?? undefined,
          mood: tagMood,
        });
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
  let filePath = path.join(staticDir, pathname === '/' ? 'index.html' : pathname);

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
