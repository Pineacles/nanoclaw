import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { TaskEvent } from './useChat';

export interface Task {
  id: string;
  title: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
  run_as?: string;
  decision_mode?: number;
  workflow_ref?: string | null;
  reference_files?: string | null;
  model?: string | null;
}

export interface TestRunResult {
  status: string;
  result: string | null;
  error: string | null;
  duration_ms: number;
}

export interface TaskProgress {
  tool: string;
  target?: string;
}

export function useTasks(authenticated: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runningTaskIds, setRunningTaskIds] = useState<Set<string>>(new Set());
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskProgress>>({});
  const [taskResults, setTaskResults] = useState<Record<string, TestRunResult>>({});

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.get<Task[]>('/api/tasks');
      setTasks(data);
    } catch {
      // ignore
    }
  }, [authenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTask = useCallback(
    async (task: {
      prompt: string;
      schedule_type: string;
      schedule_value: string;
    }) => {
      await api.post('/api/tasks', task);
      refresh();
    },
    [refresh],
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      await api.put(`/api/tasks/${id}`, updates);
      refresh();
    },
    [refresh],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await api.delete(`/api/tasks/${id}`);
      refresh();
    },
    [refresh],
  );

  const testRun = useCallback(
    async (taskId: string) => {
      // API returns immediately, real updates come via WebSocket
      await api.post<{ status: string; taskId: string }>(`/api/tasks/${taskId}/run`, {});
    },
    [],
  );

  const activateTask = useCallback(
    async (taskId: string) => {
      await api.put(`/api/tasks/${taskId}`, { status: 'active' });
      refresh();
    },
    [refresh],
  );

  const handleTaskEvent = useCallback((event: TaskEvent) => {
    if (event.type === 'task_started') {
      setRunningTaskIds((prev) => new Set(prev).add(event.taskId));
      setTaskProgress((prev) => { const next = { ...prev }; delete next[event.taskId]; return next; });
      setTaskResults((prev) => { const next = { ...prev }; delete next[event.taskId]; return next; });
    }
    if (event.type === 'task_progress' && event.tool) {
      setTaskProgress((prev) => ({ ...prev, [event.taskId]: { tool: event.tool!, target: event.target } }));
    }
    if (event.type === 'task_complete') {
      setRunningTaskIds((prev) => { const next = new Set(prev); next.delete(event.taskId); return next; });
      setTaskProgress((prev) => { const next = { ...prev }; delete next[event.taskId]; return next; });
      setTaskResults((prev) => ({
        ...prev,
        [event.taskId]: {
          status: event.status || 'success',
          result: event.result ?? null,
          error: event.error ?? null,
          duration_ms: event.duration_ms ?? 0,
        },
      }));
      refresh();
    }
  }, [refresh]);

  return {
    tasks, createTask, updateTask, deleteTask, testRun, activateTask, refresh,
    runningTaskIds, taskProgress, taskResults, handleTaskEvent,
  };
}
