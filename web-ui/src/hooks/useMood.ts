import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface MoodData {
  current_mood: string;
  energy: number;
  activity: string;
  updated_at: string;
}

export function useMood(authenticated: boolean) {
  const [mood, setMood] = useState<MoodData>({
    current_mood: 'chill',
    energy: 6,
    activity: '',
    updated_at: '',
  });
  const setMoodRef = useRef(setMood);
  setMoodRef.current = setMood;

  const fetchMood = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.get<MoodData>('/api/mood');
      setMood(data);
    } catch {
      // ignore
    }
  }, [authenticated]);

  // Initial fetch + slow background poll as fallback
  useEffect(() => {
    fetchMood();
    const interval = setInterval(fetchMood, 30000);
    return () => clearInterval(interval);
  }, [fetchMood]);

  return { mood, setMood };
}
