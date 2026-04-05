import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface WebSession {
  id: string;
  name: string;
  mode: 'persona' | 'plain';
  created_at: string;
  updated_at: string;
}

const SESSION_KEY = 'nanoclaw_active_session';
const VIEW_KEY = 'nanoclaw_active_view';

export function useSessions(authenticated: boolean) {
  const [sessions, setSessions] = useState<WebSession[]>([]);
  const [activeSessionId, setActiveSessionIdRaw] = useState(() =>
    localStorage.getItem(SESSION_KEY) || 'default'
  );

  // Persist activeSessionId to localStorage on every change
  const setActiveSessionId = useCallback((id: string) => {
    setActiveSessionIdRaw(id);
    localStorage.setItem(SESSION_KEY, id);
  }, []);

  // Load sessions on mount
  useEffect(() => {
    if (!authenticated) return;
    api
      .get<WebSession[]>('/api/sessions')
      .then((data) => {
        if (data.length === 0) {
          api
            .post<WebSession>('/api/sessions', { name: 'Chat 1' })
            .then((s) => {
              setSessions([s]);
              setActiveSessionId(s.id);
            });
        } else {
          setSessions(data);
          // If saved session no longer exists, switch to first
          const saved = localStorage.getItem(SESSION_KEY);
          if (saved && data.find((s) => s.id === saved)) {
            setActiveSessionIdRaw(saved);
          } else if (!data.find((s) => s.id === activeSessionId)) {
            setActiveSessionId(data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [authenticated]);

  const createSession = useCallback(async (name?: string, mode?: 'persona' | 'plain') => {
    const sessionName = name || `Chat ${Date.now().toString(36)}`;
    try {
      const session = await api.post<WebSession>('/api/sessions', {
        name: sessionName,
        mode: mode || 'persona',
      });
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      return session;
    } catch {
      return null;
    }
  }, []);

  const renameSession = useCallback(async (id: string, name: string) => {
    try {
      await api.put('/api/sessions/' + encodeURIComponent(id), { name });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name, updated_at: new Date().toISOString() } : s)),
      );
    } catch {
      // Ignore
    }
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await api.delete('/api/sessions/' + encodeURIComponent(id));
        setSessions((prev) => {
          const remaining = prev.filter((s) => s.id !== id);
          if (remaining.length === 0) {
            // Create a new default session
            api
              .post<WebSession>('/api/sessions', { name: 'Chat 1' })
              .then((s) => {
                setSessions([s]);
                setActiveSessionId(s.id);
              });
            return [];
          }
          if (id === activeSessionId) {
            setActiveSessionId(remaining[0].id);
          }
          return remaining;
        });
      } catch {
        // Ignore
      }
    },
    [activeSessionId],
  );

  const handleSessionRenamed = useCallback((id: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s)),
    );
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    renameSession,
    deleteSession,
    handleSessionRenamed,
  };
}
