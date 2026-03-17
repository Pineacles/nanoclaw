import fs from 'fs';
import path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

import { GROUPS_DIR } from '../../config.js';
import {
  getTasksForGroup,
  createTask,
  updateTask,
  deleteTask,
  getMessageById,
  getNextBotMessage,
  deleteMessage,
  createWebSession,
  getWebSessions,
  updateWebSession,
  deleteWebSession,
} from '../../db.js';
import { logger } from '../../logger.js';
import { resolveMood } from './mood.js';

const GROUP_FOLDER = 'seyoung';
const GROUP_JID = 'web:seyoung';

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function groupDir(): string {
  return path.join(GROUPS_DIR, GROUP_FOLDER);
}

// --- Messages ---

function handleMessages(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  getMessages: (sessionId?: string) => Array<{
    id: string;
    sender_name: string;
    content: string;
    timestamp: string;
    is_bot_message: number;
  }>,
): void {
  if (req.method !== 'GET') return error(res, 'Method not allowed', 405);
  const sessionId = url.searchParams.get('session_id') ?? undefined;
  const messages = getMessages(sessionId).map((m) => ({
    ...m,
    // Strip system time note injected for the agent — not for the UI
    content: m.content.replace(/^\[System: Current time is [^\]]+\]\n/, ''),
  }));
  json(res, messages);
}

function handleDeleteMessage(
  _req: IncomingMessage,
  res: ServerResponse,
  messageId: string,
): void {
  const msg = getMessageById(messageId, GROUP_JID);
  if (!msg) return error(res, 'Message not found', 404);

  const deletedIds: string[] = [messageId];

  // If user message, also delete the next bot response
  if (msg.is_bot_message === 0) {
    const nextBot = getNextBotMessage(GROUP_JID, msg.timestamp, msg.session_id);
    if (nextBot) {
      deleteMessage(nextBot.id, GROUP_JID);
      deletedIds.push(nextBot.id);
    }
  }

  deleteMessage(messageId, GROUP_JID);
  json(res, { ok: true, deletedIds });
}

// --- Sessions ---

function handleSessionsList(_req: IncomingMessage, res: ServerResponse): void {
  json(res, getWebSessions());
}

async function handleSessionCreate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const id = crypto.randomUUID();
  const session = createWebSession(id, body.name || 'New Chat');
  json(res, session, 201);
}

async function handleSessionUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  updateWebSession(sessionId, body.name);
  json(res, { ok: true });
}

function handleSessionDelete(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
): void {
  deleteWebSession(sessionId);
  json(res, { ok: true });
}

// --- Memory ---

function handleMemoryList(_req: IncomingMessage, res: ServerResponse): void {
  const dir = groupDir();
  if (!fs.existsSync(dir)) return json(res, []);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const result = files.map((f) => {
    const stat = fs.statSync(path.join(dir, f));
    return {
      filename: f,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    };
  });
  json(res, result);
}

function handleMemoryRead(
  _req: IncomingMessage,
  res: ServerResponse,
  filename: string,
): void {
  if (!filename.endsWith('.md') || filename.includes('..') || filename.includes('/')) {
    return error(res, 'Invalid filename', 400);
  }
  const filePath = path.join(groupDir(), filename);
  if (!fs.existsSync(filePath)) return error(res, 'Not found', 404);
  const content = fs.readFileSync(filePath, 'utf-8');
  json(res, { filename, content });
}

async function handleMemoryWrite(
  req: IncomingMessage,
  res: ServerResponse,
  filename: string,
): Promise<void> {
  if (!filename.endsWith('.md') || filename.includes('..') || filename.includes('/')) {
    return error(res, 'Invalid filename', 400);
  }
  const body = JSON.parse(await readBody(req));
  const filePath = path.join(groupDir(), filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body.content, 'utf-8');
  json(res, { ok: true });
}

async function handleMemoryCreate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  if (!body.filename || !body.filename.endsWith('.md')) {
    return error(res, 'filename must end with .md', 400);
  }
  if (body.filename.includes('..') || body.filename.includes('/')) {
    return error(res, 'Invalid filename', 400);
  }
  const filePath = path.join(groupDir(), body.filename);
  if (fs.existsSync(filePath)) return error(res, 'File already exists', 409);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body.content || '', 'utf-8');
  json(res, { ok: true }, 201);
}

// --- Tasks ---

function handleTasksList(_req: IncomingMessage, res: ServerResponse): void {
  const tasks = getTasksForGroup(GROUP_FOLDER);
  json(res, tasks);
}

async function handleTaskCreate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const task = {
    id: crypto.randomUUID(),
    group_folder: GROUP_FOLDER,
    chat_jid: GROUP_JID,
    prompt: body.prompt,
    schedule_type: body.schedule_type || 'once',
    schedule_value: body.schedule_value || '',
    context_mode: body.context_mode || 'group' as const,
    next_run: body.next_run || null,
    status: 'active' as const,
    created_at: new Date().toISOString(),
  };
  createTask(task);
  json(res, task, 201);
}

async function handleTaskUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  updateTask(taskId, body);
  json(res, { ok: true });
}

function handleTaskDelete(
  _req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): void {
  deleteTask(taskId);
  json(res, { ok: true });
}

// --- Image Upload ---

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  if (!body.data || !body.filename) {
    return error(res, 'data and filename required', 400);
  }

  // Validate filename
  const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const filename = `${timestamp}_${safeName}`;

  const uploadsDir = path.join(groupDir(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  // Decode base64 data URI
  const matches = body.data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return error(res, 'Invalid data URI', 400);

  const buffer = Buffer.from(matches[2], 'base64');
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);

  json(res, {
    path: `/workspace/group/uploads/${filename}`,
    filename,
  });
}

// --- Settings ---

function settingsPath(): string {
  return path.join(groupDir(), 'settings.json');
}

function handleSettingsGet(_req: IncomingMessage, res: ServerResponse): void {
  const p = settingsPath();
  if (!fs.existsSync(p)) return json(res, {});
  try {
    json(res, JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch {
    json(res, {});
  }
}

async function handleSettingsUpdate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  fs.mkdirSync(groupDir(), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(body, null, 2), 'utf-8');
  json(res, { ok: true });
}

// --- Quick Actions ---

function quickActionsPath(): string {
  return path.join(groupDir(), 'quick-actions.json');
}

function handleQuickActionsGet(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  const p = quickActionsPath();
  if (!fs.existsSync(p)) return json(res, []);
  try {
    json(res, JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch {
    json(res, []);
  }
}

async function handleQuickActionCreate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req));
  const p = quickActionsPath();
  let actions: Array<{ id: string; label: string; prompt: string }> = [];
  if (fs.existsSync(p)) {
    try {
      actions = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      /* empty */
    }
  }
  const action = { id: crypto.randomUUID(), label: body.label, prompt: body.prompt };
  actions.push(action);
  fs.mkdirSync(groupDir(), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(actions, null, 2), 'utf-8');
  json(res, action, 201);
}

function handleQuickActionDelete(
  _req: IncomingMessage,
  res: ServerResponse,
  actionId: string,
): void {
  const p = quickActionsPath();
  if (!fs.existsSync(p)) return error(res, 'Not found', 404);
  let actions: Array<{ id: string; label: string; prompt: string }> = [];
  try {
    actions = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return error(res, 'Not found', 404);
  }
  const filtered = actions.filter((a) => a.id !== actionId);
  if (filtered.length === actions.length) return error(res, 'Not found', 404);
  fs.writeFileSync(p, JSON.stringify(filtered, null, 2), 'utf-8');
  json(res, { ok: true });
}

// --- Route dispatcher ---

export interface ApiDeps {
  getMessages: (sessionId?: string) => Array<{
    id: string;
    sender_name: string;
    content: string;
    timestamp: string;
    is_bot_message: number;
    mood: string;
  }>;
}

export async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: ApiDeps,
): Promise<boolean> {
  const p = url.pathname;
  const method = req.method || 'GET';

  try {
    // Messages
    if (p === '/api/messages' && method === 'GET') {
      handleMessages(req, res, url, deps.getMessages);
      return true;
    }
    const messageMatch = p.match(/^\/api\/messages\/(.+)$/);
    if (messageMatch && method === 'DELETE') {
      handleDeleteMessage(req, res, decodeURIComponent(messageMatch[1]));
      return true;
    }

    // Sessions
    if (p === '/api/sessions' && method === 'GET') {
      handleSessionsList(req, res);
      return true;
    }
    if (p === '/api/sessions' && method === 'POST') {
      await handleSessionCreate(req, res);
      return true;
    }
    const sessionMatch = p.match(/^\/api\/sessions\/(.+)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      if (method === 'PUT') {
        await handleSessionUpdate(req, res, sessionId);
        return true;
      }
      if (method === 'DELETE') {
        handleSessionDelete(req, res, sessionId);
        return true;
      }
    }

    // Memory
    if (p === '/api/memory' && method === 'GET') {
      handleMemoryList(req, res);
      return true;
    }
    if (p === '/api/memory' && method === 'POST') {
      await handleMemoryCreate(req, res);
      return true;
    }
    const memoryMatch = p.match(/^\/api\/memory\/(.+)$/);
    if (memoryMatch) {
      const filename = decodeURIComponent(memoryMatch[1]);
      if (method === 'GET') {
        handleMemoryRead(req, res, filename);
        return true;
      }
      if (method === 'PUT') {
        await handleMemoryWrite(req, res, filename);
        return true;
      }
    }

    // Tasks
    if (p === '/api/tasks' && method === 'GET') {
      handleTasksList(req, res);
      return true;
    }
    if (p === '/api/tasks' && method === 'POST') {
      await handleTaskCreate(req, res);
      return true;
    }
    const taskMatch = p.match(/^\/api\/tasks\/(.+)$/);
    if (taskMatch) {
      const taskId = decodeURIComponent(taskMatch[1]);
      if (method === 'PUT') {
        await handleTaskUpdate(req, res, taskId);
        return true;
      }
      if (method === 'DELETE') {
        handleTaskDelete(req, res, taskId);
        return true;
      }
    }

    // Mood
    if (p === '/api/mood' && method === 'GET') {
      json(res, resolveMood());
      return true;
    }

    // Upload
    if (p === '/api/upload' && method === 'POST') {
      await handleUpload(req, res);
      return true;
    }

    // Settings
    if (p === '/api/settings' && method === 'GET') {
      handleSettingsGet(req, res);
      return true;
    }
    if (p === '/api/settings' && method === 'PUT') {
      await handleSettingsUpdate(req, res);
      return true;
    }

    // Quick Actions
    if (p === '/api/quick-actions' && method === 'GET') {
      handleQuickActionsGet(req, res);
      return true;
    }
    if (p === '/api/quick-actions' && method === 'POST') {
      await handleQuickActionCreate(req, res);
      return true;
    }
    const qaMatch = p.match(/^\/api\/quick-actions\/(.+)$/);
    if (qaMatch && method === 'DELETE') {
      handleQuickActionDelete(req, res, decodeURIComponent(qaMatch[1]));
      return true;
    }

    return false;
  } catch (err) {
    logger.error({ err, path: p }, 'API route error');
    error(res, 'Internal server error', 500);
    return true;
  }
}
