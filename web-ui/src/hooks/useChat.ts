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
  autoLoadedMemories?: string[];
}

export interface ToolStatus {
  tool: string;
  target?: string;
}

export interface TaskEvent {
  type: 'task_started' | 'task_progress' | 'task_complete';
  taskId: string;
  tool?: string;
  target?: string;
  status?: string;
  result?: string | null;
  error?: string | null;
  duration_ms?: number;
}

export function useChat(
  authenticated: boolean,
  activeSessionId: string,
  onMoodPush?: (mood: { current_mood: string; energy: number; activity: string }) => void,
  onSessionRenamed?: (sessionId: string, name: string) => void,
  onTaskEvent?: (event: TaskEvent) => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const onMoodPushRef = useRef(onMoodPush);
  const onSessionRenamedRef = useRef(onSessionRenamed);
  const onTaskEventRef = useRef(onTaskEvent);
  const activeSessionIdRef = useRef(activeSessionId);
  onMoodPushRef.current = onMoodPush;
  onTaskEventRef.current = onTaskEvent;
  activeSessionIdRef.current = activeSessionId;
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
          auto_loaded_memories?: string[];
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
            autoLoadedMemories: m.auto_loaded_memories,
          })),
        );
      })
      .catch(() => {
        // Will retry on reconnect
      });
  }, [authenticated, activeSessionId]);

  const onWsMessage = useCallback(
    (msg: { type: string; id?: string; content?: string; done?: boolean; isTyping?: boolean; message?: string; tool?: string; target?: string; current_mood?: string; energy?: number; activity?: string; sessionId?: string; name?: string; sender_name?: string; timestamp?: string }) => {
      // User message broadcast — from any client (including self)
      // Deduplicates so the sender doesn't see doubles
      if (msg.type === 'new_user_message' && msg.id && msg.content) {
        if (msg.sessionId && msg.sessionId !== activeSessionIdRef.current) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [
            ...prev,
            {
              id: msg.id!,
              content: msg.content!,
              sender: 'user' as const,
              timestamp: msg.timestamp || new Date().toISOString(),
            },
          ];
        });
      }

      if (msg.type === 'session_renamed' && msg.sessionId && msg.name) {
        onSessionRenamedRef.current?.(msg.sessionId, msg.name);
      }

      if (msg.type === 'task_started' || msg.type === 'task_progress' || msg.type === 'task_complete') {
        onTaskEventRef.current?.(msg as unknown as TaskEvent);
      }

      // Session state — sent on connect, session switch, or queue status change
      if (msg.type === 'session_state' && msg.sessionId === activeSessionIdRef.current) {
        setIsTyping(!!msg.isTyping);
        setToolStatus(msg.tool ? { tool: (msg.tool as unknown as {tool:string}).tool, target: (msg.tool as unknown as {tool:string;target?:string}).target } : null);
        setIsQueued(!!(msg as unknown as { queued?: boolean }).queued);
        // Restore streaming message if one is in progress
        const stateMsg = msg as unknown as { messageId?: string; content?: string };
        if (stateMsg.messageId && stateMsg.content) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === stateMsg.messageId);
            const updated: ChatMessage = {
              id: stateMsg.messageId!,
              content: stateMsg.content!,
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

      if (msg.type === 'mood' && msg.current_mood) {
        onMoodPushRef.current?.({
          current_mood: msg.current_mood,
          energy: msg.energy ?? 5,
          activity: msg.activity ?? '',
        });
      }

      // Typing and tool_use — show for the active session
      if (msg.type === 'typing') {
        if (msg.sessionId && msg.sessionId !== activeSessionIdRef.current) return;
        const typing = msg.isTyping ?? false;
        setIsTyping(typing);
        if (typing) setIsQueued(false);
        if (!typing) {
          setToolStatus(null);
        }
      }

      if (msg.type === 'tool_use') {
        if (msg.sessionId && msg.sessionId !== activeSessionIdRef.current) return;
        setToolStatus({ tool: msg.tool!, target: msg.target });
      }

      if (msg.type === 'message') {
        const { id, content, done, sessionId, mood } = msg as {
          id: string;
          content: string;
          done: boolean;
          sessionId?: string;
          mood?: string;
        };

        // Ignore messages for other sessions
        if (sessionId && sessionId !== activeSessionIdRef.current) return;

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
                mood,
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

  // Request current session state on connect and session switch
  // This restores typing/tool/stream state after page refresh
  useEffect(() => {
    if (connected && activeSessionId) {
      send({ type: 'get_session_state', sessionId: activeSessionId });
    }
    // Reset local state when switching sessions
    setIsTyping(false);
    setToolStatus(null);
    setIsQueued(false);
  }, [connected, activeSessionId, send]);

  const sendMessage = useCallback(
    (content: string, images?: string[], files?: { name: string; data: string }[]) => {
      // Send via WebSocket — the server will broadcast back as new_user_message
      // which the onWsMessage handler will add to the local state (with dedup)
      send({ type: 'chat', content, images, files, sessionId: activeSessionId });
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

  return { messages, isTyping, toolStatus, isQueued, connected, sendMessage, deleteMessage };
}
