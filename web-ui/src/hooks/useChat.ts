import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from './useWebSocket';

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: string;
  streaming?: boolean;
  mood?: string;
}

export interface ToolStatus {
  tool: string;
  target?: string;
}

export function useChat(
  authenticated: boolean,
  activeSessionId: string,
  onMoodPush?: (mood: { current_mood: string; energy: number; activity: string }) => void,
  onSessionRenamed?: (sessionId: string, name: string) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const onMoodPushRef = useRef(onMoodPush);
  const onSessionRenamedRef = useRef(onSessionRenamed);
  onMoodPushRef.current = onMoodPush;
  onSessionRenamedRef.current = onSessionRenamed;
  const streamingRef = useRef<{ id: string; content: string } | null>(null);

  // Load history on mount and when session changes
  useEffect(() => {
    if (!authenticated) return;
    setMessages([]);
    api
      .get<
        Array<{
          id: string;
          sender_name: string;
          content: string;
          timestamp: string;
          is_bot_message: number;
          mood: string;
        }>
      >(`/api/messages?session_id=${encodeURIComponent(activeSessionId)}`)
      .then((msgs) => {
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            content: m.content,
            sender: m.is_bot_message ? 'bot' : 'user',
            timestamp: m.timestamp,
            mood: m.mood,
          })),
        );
      })
      .catch(() => {
        // Will retry on reconnect
      });
  }, [authenticated, activeSessionId]);

  const onWsMessage = useCallback(
    (msg: { type: string; id?: string; content?: string; done?: boolean; isTyping?: boolean; message?: string; tool?: string; target?: string; current_mood?: string; energy?: number; activity?: string; sessionId?: string; name?: string }) => {
      if (msg.type === 'session_renamed' && msg.sessionId && msg.name) {
        onSessionRenamedRef.current?.(msg.sessionId, msg.name);
      }

      if (msg.type === 'mood' && msg.current_mood) {
        onMoodPushRef.current?.({
          current_mood: msg.current_mood,
          energy: msg.energy ?? 5,
          activity: msg.activity ?? '',
        });
      }

      if (msg.type === 'typing') {
        const typing = msg.isTyping ?? false;
        setIsTyping(typing);
        if (!typing) {
          setToolStatus(null);
        }
      }

      if (msg.type === 'tool_use') {
        setToolStatus({ tool: msg.tool!, target: msg.target });
      }

      if (msg.type === 'message') {
        const { id, content, done } = msg as {
          id: string;
          content: string;
          done: boolean;
        };

        // Clear tool status when actual content arrives
        if (content) {
          setToolStatus(null);
        }

        if (done) {
          // Final message — replace streaming with final
          setIsTyping(false);
          setToolStatus(null);
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== id);
            return [
              ...filtered,
              {
                id,
                content,
                sender: 'bot' as const,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          streamingRef.current = null;
        } else {
          // Streaming update
          streamingRef.current = { id, content };
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === id);
            const updated: ChatMessage = {
              id,
              content,
              sender: 'bot',
              timestamp: new Date().toISOString(),
              streaming: true,
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [...prev, updated];
          });
        }
      }
    },
    [],
  );

  const { connected, send } = useWebSocket({
    onMessage: onWsMessage,
    enabled: authenticated,
  });

  const sendMessage = useCallback(
    (content: string, images?: string[]) => {
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Add user message to local state
      setMessages((prev) => [
        ...prev,
        { id, content, sender: 'user', timestamp },
      ]);

      // Send via WebSocket with sessionId
      send({ type: 'chat', content, images, sessionId: activeSessionId });
    },
    [send, activeSessionId],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      try {
        const result = await api.delete<{ ok: boolean; deletedIds: string[] }>(
          `/api/messages/${encodeURIComponent(id)}`,
        );
        if (result.deletedIds) {
          setMessages((prev) =>
            prev.filter((m) => !result.deletedIds.includes(m.id)),
          );
        }
      } catch {
        // Ignore errors
      }
    },
    [],
  );

  return { messages, isTyping, toolStatus, connected, sendMessage, deleteMessage };
}
