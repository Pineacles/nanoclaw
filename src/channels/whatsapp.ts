import { exec, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import makeWASocket, {
  Browsers,
  DisconnectReason,
  WASocket,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  useMultiFileAuthState,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import crypto from 'crypto';
import {
  ASSISTANT_HAS_OWN_NUMBER,
  ASSISTANT_NAME,
  GROUPS_DIR,
  STORE_DIR,
} from '../config.js';
import { getLastGroupSync, setLastGroupSync, updateChatName } from '../db.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';
import { registerChannel, ChannelOpts } from './registry.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface WhatsAppChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  /** If set, messages from this JID are bridged to the web channel instead of the normal pipeline. */
  bridgeJid?: string;
  /** Called when a message arrives from the bridgeJid. */
  onBridgeMessage?: (
    senderName: string,
    content: string,
    images?: Buffer[],
  ) => void;
}

export class WhatsAppChannel implements Channel {
  name = 'whatsapp';

  private sock!: WASocket;
  private connected = false;
  private lidToPhoneMap: Record<string, string> = {};
  private outgoingQueue: Array<{ jid: string; text: string }> = [];
  private flushing = false;
  private groupSyncTimerStarted = false;

  private opts: WhatsAppChannelOpts;

  constructor(opts: WhatsAppChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.connectInternal(resolve).catch(reject);
    });
  }

  private async connectInternal(onFirstOpen?: () => void): Promise<void> {
    const authDir = path.join(STORE_DIR, 'auth');
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const { version } = await fetchLatestWaWebVersion({}).catch((err) => {
      logger.warn(
        { err },
        'Failed to fetch latest WA Web version, using default',
      );
      return { version: undefined };
    });
    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as any),
      },
      printQRInTerminal: false,
      logger: logger as any,
      browser: Browsers.macOS('Chrome'),
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const msg =
          'WhatsApp authentication required. Run /setup in Claude Code.';
        logger.error(msg);
        exec(
          `osascript -e 'display notification "${msg}" with title "NanoClaw" sound name "Basso"'`,
        );
        setTimeout(() => process.exit(1), 1000);
      }

      if (connection === 'close') {
        this.connected = false;
        const reason = (
          lastDisconnect?.error as { output?: { statusCode?: number } }
        )?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        logger.info(
          {
            reason,
            shouldReconnect,
            queuedMessages: this.outgoingQueue.length,
          },
          'Connection closed',
        );

        if (shouldReconnect) {
          logger.info('Reconnecting...');
          this.connectInternal().catch((err) => {
            logger.error({ err }, 'Failed to reconnect, retrying in 5s');
            setTimeout(() => {
              this.connectInternal().catch((err2) => {
                logger.error({ err: err2 }, 'Reconnection retry failed');
              });
            }, 5000);
          });
        } else {
          logger.info('Logged out. Run /setup to re-authenticate.');
          process.exit(0);
        }
      } else if (connection === 'open') {
        this.connected = true;
        logger.info('Connected to WhatsApp');

        // Announce availability so WhatsApp relays subsequent presence updates (typing indicators)
        this.sock.sendPresenceUpdate('available').catch((err) => {
          logger.warn({ err }, 'Failed to send presence update');
        });

        // Build LID to phone mapping from auth state for self-chat translation
        if (this.sock.user) {
          const phoneUser = this.sock.user.id.split(':')[0];
          const lidUser = this.sock.user.lid?.split(':')[0];
          if (lidUser && phoneUser) {
            this.lidToPhoneMap[lidUser] = `${phoneUser}@s.whatsapp.net`;
            logger.debug({ lidUser, phoneUser }, 'LID to phone mapping set');
          }
        }

        // Flush any messages queued while disconnected
        this.flushOutgoingQueue().catch((err) =>
          logger.error({ err }, 'Failed to flush outgoing queue'),
        );

        // Sync group metadata on startup (respects 24h cache)
        this.syncGroupMetadata().catch((err) =>
          logger.error({ err }, 'Initial group sync failed'),
        );
        // Set up daily sync timer (only once)
        if (!this.groupSyncTimerStarted) {
          this.groupSyncTimerStarted = true;
          setInterval(() => {
            this.syncGroupMetadata().catch((err) =>
              logger.error({ err }, 'Periodic group sync failed'),
            );
          }, GROUP_SYNC_INTERVAL_MS);
        }

        // Signal first connection to caller
        if (onFirstOpen) {
          onFirstOpen();
          onFirstOpen = undefined;
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        try {
          if (!msg.message) continue;
          // Unwrap container types (viewOnceMessageV2, ephemeralMessage,
          // editedMessage, etc.) so that conversation, extendedTextMessage,
          // imageMessage, etc. are accessible at the top level.
          const normalized = normalizeMessageContent(msg.message);
          if (!normalized) continue;
          const rawJid = msg.key.remoteJid;
          if (!rawJid || rawJid === 'status@broadcast') continue;

          // Translate LID JID to phone JID if applicable
          const chatJid = await this.translateJid(rawJid);

          const timestamp = new Date(
            Number(msg.messageTimestamp) * 1000,
          ).toISOString();

          // Always notify about chat metadata for group discovery
          const isGroup = chatJid.endsWith('@g.us');
          this.opts.onChatMetadata(
            chatJid,
            timestamp,
            undefined,
            'whatsapp',
            isGroup,
          );

          // Bridge mode: intercept messages from the bridged JID
          if (
            this.opts.bridgeJid &&
            chatJid === this.opts.bridgeJid &&
            this.opts.onBridgeMessage
          ) {
            const fromMe = msg.key.fromMe || false;
            const content =
              normalized.conversation ||
              normalized.extendedTextMessage?.text ||
              normalized.imageMessage?.caption ||
              normalized.videoMessage?.caption ||
              '';

            // Skip bot's own messages (sent by us via the bridge)
            const isBotMessage = ASSISTANT_HAS_OWN_NUMBER
              ? fromMe
              : content.startsWith(`${ASSISTANT_NAME}:`);
            if (isBotMessage) continue;

            // Skip empty protocol messages
            if (
              !content &&
              !normalized.imageMessage &&
              !normalized.videoMessage
            )
              continue;

            const senderName =
              msg.pushName ||
              (msg.key.participant || msg.key.remoteJid || '').split('@')[0];

            // Download media if present
            const images: Buffer[] = [];
            try {
              if (normalized.imageMessage) {
                const buf = await downloadMediaMessage(msg, 'buffer', {});
                if (Buffer.isBuffer(buf)) images.push(buf);
              }
              if (normalized.videoMessage) {
                // Videos are too large to inject — just note it in the text
                const videoCaption = normalized.videoMessage.caption || '';
                this.opts.onBridgeMessage(
                  senderName,
                  videoCaption
                    ? `${content}\n[Video attached]`
                    : content || '[Video attached]',
                );
                continue;
              }
            } catch (err) {
              logger.warn({ err }, 'Failed to download WhatsApp media');
            }

            this.opts.onBridgeMessage(
              senderName,
              content || '',
              images.length > 0 ? images : undefined,
            );
            continue;
          }

          // Only deliver full message for registered groups
          const groups = this.opts.registeredGroups();
          if (groups[chatJid]) {
            let content =
              normalized.conversation ||
              normalized.extendedTextMessage?.text ||
              normalized.imageMessage?.caption ||
              normalized.videoMessage?.caption ||
              normalized.documentMessage?.caption ||
              '';

            const hasMedia =
              !!normalized.imageMessage ||
              !!normalized.videoMessage ||
              !!normalized.audioMessage ||
              !!normalized.documentMessage ||
              !!normalized.stickerMessage;

            // Skip protocol messages with no text and no media
            if (!content && !hasMedia) continue;

            // Download and save media attachments
            const group = groups[chatJid];
            if (hasMedia) {
              try {
                const uploadsDir = path.join(
                  GROUPS_DIR,
                  group.folder,
                  'uploads',
                );
                fs.mkdirSync(uploadsDir, { recursive: true });

                if (normalized.imageMessage) {
                  const buf = await downloadMediaMessage(msg, 'buffer', {});
                  if (Buffer.isBuffer(buf)) {
                    const ext =
                      (normalized.imageMessage.mimetype || 'image/jpeg')
                        .split('/')[1]
                        ?.split(';')[0] || 'jpg';
                    const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
                    fs.writeFileSync(path.join(uploadsDir, filename), buf);
                    content += `\n[Image: /workspace/group/uploads/${filename}]`;
                    logger.info(
                      { filename, size: buf.length },
                      'WhatsApp image saved',
                    );
                  }
                }

                if (normalized.videoMessage) {
                  const buf = await downloadMediaMessage(msg, 'buffer', {});
                  if (Buffer.isBuffer(buf)) {
                    const ext =
                      (normalized.videoMessage.mimetype || 'video/mp4')
                        .split('/')[1]
                        ?.split(';')[0] || 'mp4';
                    const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
                    fs.writeFileSync(path.join(uploadsDir, filename), buf);
                    content += `\n[Video: /workspace/group/uploads/${filename}]`;
                    logger.info(
                      { filename, size: buf.length },
                      'WhatsApp video saved',
                    );
                  }
                }

                if (normalized.audioMessage) {
                  const buf = await downloadMediaMessage(msg, 'buffer', {});
                  if (Buffer.isBuffer(buf)) {
                    const isPtt = normalized.audioMessage.ptt;
                    const ext = isPtt
                      ? 'ogg'
                      : (normalized.audioMessage.mimetype || 'audio/ogg')
                          .split('/')[1]
                          ?.split(';')[0] || 'ogg';
                    const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
                    fs.writeFileSync(path.join(uploadsDir, filename), buf);
                    content += `\n[${isPtt ? 'Voice' : 'Audio'}: /workspace/group/uploads/${filename}]`;
                    logger.info(
                      { filename, size: buf.length, isPtt },
                      'WhatsApp audio saved',
                    );
                  }
                }

                if (normalized.documentMessage) {
                  const buf = await downloadMediaMessage(msg, 'buffer', {});
                  if (Buffer.isBuffer(buf)) {
                    const originalName =
                      normalized.documentMessage.fileName || 'document';
                    const safeName = originalName.replace(
                      /[^a-zA-Z0-9._-]/g,
                      '_',
                    );
                    const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`;
                    fs.writeFileSync(path.join(uploadsDir, filename), buf);
                    content += `\n[Document: /workspace/group/uploads/${filename}]`;
                    logger.info(
                      { filename, originalName, size: buf.length },
                      'WhatsApp document saved',
                    );
                  }
                }

                if (normalized.stickerMessage) {
                  const buf = await downloadMediaMessage(msg, 'buffer', {});
                  if (Buffer.isBuffer(buf)) {
                    const ext =
                      (normalized.stickerMessage.mimetype || 'image/webp')
                        .split('/')[1]
                        ?.split(';')[0] || 'webp';
                    const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
                    fs.writeFileSync(path.join(uploadsDir, filename), buf);
                    content += `\n[Sticker: /workspace/group/uploads/${filename}]`;
                  }
                }
              } catch (err) {
                logger.warn(
                  { err, chatJid },
                  'Failed to download WhatsApp media',
                );
                if (normalized.imageMessage)
                  content += '\n[Image: download failed]';
                if (normalized.videoMessage)
                  content += '\n[Video: download failed]';
                if (normalized.audioMessage)
                  content += '\n[Voice note: download failed]';
                if (normalized.documentMessage)
                  content += '\n[Document: download failed]';
              }
            }

            // Still skip if no content after media processing
            if (!content.trim()) continue;

            const sender = msg.key.participant || msg.key.remoteJid || '';
            const senderName = msg.pushName || sender.split('@')[0];

            const fromMe = msg.key.fromMe || false;
            // Detect bot messages: with own number, fromMe is reliable
            // since only the bot sends from that number.
            // With shared number, bot messages carry the assistant name prefix
            // (even in DMs/self-chat) so we check for that.
            const isBotMessage = ASSISTANT_HAS_OWN_NUMBER
              ? fromMe
              : content.startsWith(`${ASSISTANT_NAME}:`);

            this.opts.onMessage(chatJid, {
              id: msg.key.id || '',
              chat_jid: chatJid,
              sender,
              sender_name: senderName,
              content,
              timestamp,
              is_from_me: fromMe,
              is_bot_message: isBotMessage,
            });
          }
        } catch (err) {
          logger.error(
            { err, remoteJid: msg.key?.remoteJid },
            'Error processing incoming message',
          );
        }
      }
    });
  }

  async sendMessage(
    jid: string,
    text: string,
    _sessionId?: string,
  ): Promise<void> {
    // Prefix bot messages with assistant name so users know who's speaking.
    // On a shared number, prefix is also needed in DMs (including self-chat)
    // to distinguish bot output from user messages.
    // Skip only when the assistant has its own dedicated phone number.
    const prefixed = ASSISTANT_HAS_OWN_NUMBER
      ? text
      : `${ASSISTANT_NAME}: ${text}`;

    if (!this.connected) {
      this.outgoingQueue.push({ jid, text: prefixed });
      logger.info(
        { jid, length: prefixed.length, queueSize: this.outgoingQueue.length },
        'WA disconnected, message queued',
      );
      return;
    }
    try {
      await this.sock.sendMessage(jid, { text: prefixed });
      logger.info({ jid, length: prefixed.length }, 'Message sent');
    } catch (err) {
      // If send fails, queue it for retry on reconnect
      this.outgoingQueue.push({ jid, text: prefixed });
      logger.warn(
        { jid, err, queueSize: this.outgoingQueue.length },
        'Failed to send, message queued',
      );
    }
  }

  async sendMedia(
    jid: string,
    filePath: string,
    caption?: string,
    voiceNote?: boolean,
  ): Promise<void> {
    if (!this.connected) {
      logger.warn({ jid, filePath }, 'WA disconnected, cannot send media');
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const filename = path.basename(filePath);

    // Determine media type from extension
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const videoExts = ['mp4', 'mkv', 'avi', 'mov', '3gp'];
    const audioExts = ['ogg', 'mp3', 'wav', 'aac', 'm4a', 'opus'];

    try {
      if (imageExts.includes(ext)) {
        await this.sock.sendMessage(jid, {
          image: buffer,
          caption: caption || undefined,
        });
      } else if (videoExts.includes(ext)) {
        await this.sock.sendMessage(jid, {
          video: buffer,
          caption: caption || undefined,
        });
      } else if (audioExts.includes(ext)) {
        let audioBuf = buffer;
        let mimetype = `audio/${ext}`;
        // Default to voice note for WhatsApp audio (more natural)
        const sendAsPtt = voiceNote !== false;

        // WhatsApp voice notes require OGG/Opus. Always convert non-ogg audio.
        if (ext !== 'ogg' && ext !== 'opus') {
          try {
            const tmpIn = path.join(
              os.tmpdir(),
              `nanoclaw-${Date.now()}.${ext}`,
            );
            const tmpOut = path.join(os.tmpdir(), `nanoclaw-${Date.now()}.ogg`);
            fs.writeFileSync(tmpIn, buffer);
            execSync(
              `ffmpeg -y -i ${tmpIn} -c:a libopus -b:a 64k -ac 1 -ar 48000 ${tmpOut}`,
              { timeout: 30000 },
            );
            audioBuf = fs.readFileSync(tmpOut);
            mimetype = 'audio/ogg; codecs=opus';
            try {
              fs.unlinkSync(tmpIn);
            } catch {
              /* ignore */
            }
            try {
              fs.unlinkSync(tmpOut);
            } catch {
              /* ignore */
            }
            logger.info(
              {
                from: ext,
                size: buffer.length,
                convertedSize: audioBuf.length,
              },
              'Converted audio to OGG/Opus',
            );
          } catch (err) {
            logger.warn(
              { err, ext },
              'ffmpeg conversion failed, sending as-is',
            );
          }
        } else {
          mimetype = 'audio/ogg; codecs=opus';
        }

        await this.sock.sendMessage(jid, {
          audio: audioBuf,
          ptt: sendAsPtt,
          mimetype,
        });
      } else {
        // Send as document for everything else (pdf, docx, zip, etc.)
        const mimeMap: Record<string, string> = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          csv: 'text/csv',
          txt: 'text/plain',
          zip: 'application/zip',
          json: 'application/json',
        };
        await this.sock.sendMessage(jid, {
          document: buffer,
          mimetype: mimeMap[ext] || 'application/octet-stream',
          fileName: filename,
          caption: caption || undefined,
        });
      }
      logger.info({ jid, filePath, ext }, 'Media sent');
    } catch (err) {
      logger.error({ jid, filePath, err }, 'Failed to send media');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.sock?.end(undefined);
  }

  async setTyping(
    jid: string,
    isTyping: boolean,
    _sessionId?: string,
  ): Promise<void> {
    try {
      const status = isTyping ? 'composing' : 'paused';
      logger.debug({ jid, status }, 'Sending presence update');
      await this.sock.sendPresenceUpdate(status, jid);
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to update typing status');
    }
  }

  async syncGroups(force: boolean): Promise<void> {
    return this.syncGroupMetadata(force);
  }

  /**
   * Sync group metadata from WhatsApp.
   * Fetches all participating groups and stores their names in the database.
   * Called on startup, daily, and on-demand via IPC.
   */
  async syncGroupMetadata(force = false): Promise<void> {
    if (!force) {
      const lastSync = getLastGroupSync();
      if (lastSync) {
        const lastSyncTime = new Date(lastSync).getTime();
        if (Date.now() - lastSyncTime < GROUP_SYNC_INTERVAL_MS) {
          logger.debug({ lastSync }, 'Skipping group sync - synced recently');
          return;
        }
      }
    }

    try {
      logger.info('Syncing group metadata from WhatsApp...');
      const groups = await this.sock.groupFetchAllParticipating();

      let count = 0;
      for (const [jid, metadata] of Object.entries(groups)) {
        if (metadata.subject) {
          updateChatName(jid, metadata.subject);
          count++;
        }
      }

      setLastGroupSync();
      logger.info({ count }, 'Group metadata synced');
    } catch (err) {
      logger.error({ err }, 'Failed to sync group metadata');
    }
  }

  private async translateJid(jid: string): Promise<string> {
    if (!jid.endsWith('@lid')) return jid;
    const lidUser = jid.split('@')[0].split(':')[0];

    // Check local cache first
    const cached = this.lidToPhoneMap[lidUser];
    if (cached) {
      logger.debug(
        { lidJid: jid, phoneJid: cached },
        'Translated LID to phone JID (cached)',
      );
      return cached;
    }

    // Query Baileys' signal repository for the mapping
    try {
      const pn = await this.sock.signalRepository?.lidMapping?.getPNForLID(jid);
      if (pn) {
        const phoneJid = `${pn.split('@')[0].split(':')[0]}@s.whatsapp.net`;
        this.lidToPhoneMap[lidUser] = phoneJid;
        logger.info(
          { lidJid: jid, phoneJid },
          'Translated LID to phone JID (signalRepository)',
        );
        return phoneJid;
      }
    } catch (err) {
      logger.debug({ err, jid }, 'Failed to resolve LID via signalRepository');
    }

    return jid;
  }

  private async flushOutgoingQueue(): Promise<void> {
    if (this.flushing || this.outgoingQueue.length === 0) return;
    this.flushing = true;
    try {
      logger.info(
        { count: this.outgoingQueue.length },
        'Flushing outgoing message queue',
      );
      while (this.outgoingQueue.length > 0) {
        const item = this.outgoingQueue.shift()!;
        // Send directly — queued items are already prefixed by sendMessage
        await this.sock.sendMessage(item.jid, { text: item.text });
        logger.info(
          { jid: item.jid, length: item.text.length },
          'Queued message sent',
        );
      }
    } finally {
      this.flushing = false;
    }
  }
}

registerChannel(
  'whatsapp',
  (opts: ChannelOpts) =>
    new WhatsAppChannel({
      ...opts,
      bridgeJid: opts.whatsappBridgeJid,
      onBridgeMessage: opts.onBridgeMessage,
    }),
);
