import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface MemoryFile {
  filename: string;
  size: number;
  modified: string;
}

export function useMemory(authenticated: boolean) {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const cache = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.get<MemoryFile[]>('/api/memory');
      setFiles(data);
    } catch {
      // ignore
    }
  }, [authenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeRequest = useRef<string | null>(null);

  const loadFile = useCallback(async (filename: string) => {
    // Tag this request so stale fetches are ignored
    activeRequest.current = filename;
    setSelectedFile(filename);

    // Show cached content immediately if available
    if (cache.current[filename] !== undefined) {
      setContent(cache.current[filename]);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Fetch fresh content in the background
    try {
      const data = await api.get<{ filename: string; content: string }>(
        `/api/memory/${encodeURIComponent(filename)}`,
      );
      cache.current[filename] = data.content;
      if (activeRequest.current === filename) {
        setContent(data.content);
        setLoading(false);
      }
    } catch {
      if (activeRequest.current === filename) {
        setContent(cache.current[filename] ?? 'Error loading file');
        setLoading(false);
      }
    }
  }, []);

  const saveFile = useCallback(
    async (filename: string, newContent: string) => {
      await api.put(`/api/memory/${encodeURIComponent(filename)}`, {
        content: newContent,
      });
      cache.current[filename] = newContent;
      setContent(newContent);
      refresh();
    },
    [refresh],
  );

  const createFile = useCallback(
    async (filename: string, initialContent: string = '') => {
      await api.post('/api/memory', { filename, content: initialContent });
      cache.current[filename] = initialContent;
      refresh();
    },
    [refresh],
  );

  const deleteFile = useCallback(
    async (filename: string) => {
      await api.delete(`/api/memory/${encodeURIComponent(filename)}`);
      delete cache.current[filename];
      if (selectedFile === filename) {
        setSelectedFile(null);
        setContent('');
      }
      refresh();
    },
    [selectedFile, refresh],
  );

  return {
    files,
    selectedFile,
    content,
    loading,
    loadFile,
    saveFile,
    createFile,
    deleteFile,
    refresh,
    setSelectedFile,
  };
}
