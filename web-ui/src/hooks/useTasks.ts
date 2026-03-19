import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface Task {
  id: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
}

export interface TestRunResult {
  status: string;
  result: string | null;
  error: string | null;
  duration_ms: number;
}

export function useTasks(authenticated: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);

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
    async (taskId: string): Promise<TestRunResult> => {
      const result = await api.post<TestRunResult>(`/api/tasks/${taskId}/run`, {});
      refresh();
      return result;
    },
    [refresh],
  );

  const activateTask = useCallback(
    async (taskId: string) => {
      await api.put(`/api/tasks/${taskId}`, { status: 'active' });
      refresh();
    },
    [refresh],
  );

  return { tasks, createTask, updateTask, deleteTask, testRun, activateTask, refresh };
}
