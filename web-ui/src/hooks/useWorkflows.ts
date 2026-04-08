import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface WorkflowMeta {
  filename: string;
  name: string;
  description: string;
  scope: string;
  triggers: string[];
  size: number;
  modified: string;
}

export interface Workflow extends WorkflowMeta {
  content: string;
  body: string;
}

export function useWorkflows(authenticated: boolean) {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.get<WorkflowMeta[]>('/api/workflows');
      setWorkflows(data);
    } catch {
      // ignore
    }
  }, [authenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadWorkflow = useCallback(async (filename: string) => {
    setLoading(true);
    try {
      const wf = await api.get<Workflow>(`/api/workflows/${encodeURIComponent(filename)}`);
      setSelectedWorkflow(wf);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const saveWorkflow = useCallback(async (filename: string, content: string) => {
    await api.put(`/api/workflows/${encodeURIComponent(filename)}`, { content });
    refresh();
    // Reload if this is the selected workflow
    setSelectedWorkflow((prev) => {
      if (prev && prev.filename === filename) {
        return { ...prev, content };
      }
      return prev;
    });
  }, [refresh]);

  const createWorkflow = useCallback(async (filename: string, content: string) => {
    await api.post('/api/workflows', { filename, content });
    refresh();
  }, [refresh]);

  const deleteWorkflow = useCallback(async (filename: string) => {
    await api.delete(`/api/workflows/${encodeURIComponent(filename)}`);
    setSelectedWorkflow((prev) => (prev?.filename === filename ? null : prev));
    refresh();
  }, [refresh]);

  const clearSelection = useCallback(() => {
    setSelectedWorkflow(null);
  }, []);

  return {
    workflows,
    selectedWorkflow,
    loading,
    refresh,
    loadWorkflow,
    saveWorkflow,
    createWorkflow,
    deleteWorkflow,
    clearSelection,
  };
}
