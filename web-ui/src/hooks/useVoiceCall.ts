import { useCallback, useEffect, useRef, useState } from 'react';

export type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

// Voice WebSocket connects through NanoClaw's proxy at /voice-ws (same host, same port, same HTTPS)

export function useVoiceCall() {
  const [callActive, setCallActive] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [duration, setDuration] = useState(0);
  const [connected, setConnected] = useState(false);
  const [assistantPartial, setAssistantPartial] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ttsSampleRateRef = useRef(22050);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef = useRef<number>(0);
  const assistantPartialRef = useRef('');

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    assistantPartialRef.current = assistantPartial;
  }, [assistantPartial]);

  // Play queued audio chunks
  const playNextChunk = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;
    const chunk = playbackQueueRef.current.shift()!;

    const int16 = new Int16Array(chunk);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, ttsSampleRateRef.current);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => playNextChunk();
    source.start();
  }, []);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // End the call
  const endCall = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_call' }));
      wsRef.current.close();
    }
    wsRef.current = null;
    setCallActive(false);
    setCallState('idle');
    cleanup();
  }, [cleanup]);

  // Start the call
  const startCall = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone not available. HTTPS required for mic access on non-localhost.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('nanoclaw_auth_token') || '';
      const wsUrl = `${protocol}//${window.location.host}/voice-ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      setCallState('connecting');

      ws.onopen = () => {
        setConnected(true);
        setCallActive(true);
        setCallState('listening');
        setTranscript([]);
        setDuration(0);
        setAssistantPartial('');
        callStartRef.current = Date.now();

        durationTimerRef.current = setInterval(() => {
          setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
        }, 1000);

        ws.send(JSON.stringify({ type: 'start_call' }));

        // Mic capture
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playbackQueueRef.current.push(event.data);
          if (!isPlayingRef.current) playNextChunk();
        } else {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'state':
              setCallState(msg.state as CallState);
              if (msg.state === 'listening' || msg.state === 'interrupted') {
                playbackQueueRef.current = [];
                isPlayingRef.current = false;
              }
              break;
            case 'user_transcript':
              setTranscript((prev) => [...prev, { role: 'user', text: msg.text, timestamp: new Date().toISOString() }]);
              break;
            case 'assistant_text':
              if (msg.done) {
                const fullText = assistantPartialRef.current + (msg.text || '');
                if (fullText) {
                  setTranscript((prev) => [...prev, { role: 'assistant', text: fullText, timestamp: new Date().toISOString() }]);
                }
                setAssistantPartial('');
              } else {
                setAssistantPartial((prev) => prev + msg.text);
              }
              break;
            case 'config':
              if (msg.sample_rate) ttsSampleRateRef.current = msg.sample_rate;
              break;
            case 'call_ended':
              break;
          }
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setCallActive(false);
        setCallState('idle');
        cleanup();
      };

      ws.onerror = () => {
        setError('Could not connect to voice server on port 3004');
        setConnected(false);
        setCallState('idle');
        cleanup();
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission denied') || msg.includes('NotAllowed')) {
        setError('Microphone permission denied. Allow mic access and try again.');
      } else if (msg.includes('secure context') || msg.includes('getUserMedia')) {
        setError('HTTPS required for microphone access.');
      } else {
        setError(`Call failed: ${msg}`);
      }
      setCallState('idle');
      cleanup();
    }
  }, [cleanup, playNextChunk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      cleanup();
    };
  }, [cleanup]);

  return {
    callActive,
    callState,
    transcript,
    duration,
    connected,
    assistantPartial,
    error,
    startCall,
    endCall,
  };
}
