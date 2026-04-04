import { useEffect, useRef } from 'react';
import { useVoiceCall, CallState } from '../hooks/useVoiceCall';

const STATE_LABELS: Record<CallState, string> = {
  idle: 'Ready to call',
  connecting: 'Connecting...',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  interrupted: 'Listening...',
};

const STATE_COLORS: Record<CallState, string> = {
  idle: 'text-on-surface-variant/50',
  connecting: 'text-on-surface-variant',
  listening: 'text-emerald-400',
  thinking: 'text-primary',
  speaking: 'text-primary',
  interrupted: 'text-emerald-400',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function VoiceCallPage() {
  const {
    callActive,
    callState,
    transcript,
    duration,
    assistantPartial,
    error,
    startCall,
    endCall,
  } = useVoiceCall();

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, assistantPartial]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-between p-4 sm:p-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="text-center pt-4 sm:pt-8">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-on-background mb-1">
            Voice <span className="text-primary italic">Call</span>
          </h1>
          {callActive && (
            <p className="text-on-surface-variant/60 text-sm font-mono">{formatDuration(duration)}</p>
          )}
        </div>

        {/* Center: call state + button */}
        <div className="flex flex-col items-center gap-6">
          {/* State indicator */}
          <div className="flex flex-col items-center gap-3">
            {/* Animated ring */}
            <div className={`relative w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center ${
              callActive ? 'animate-pulse' : ''
            }`}>
              {/* Outer ring */}
              <div className={`absolute inset-0 rounded-full border-2 transition-colors duration-500 ${
                callState === 'listening' ? 'border-emerald-400/40' :
                callState === 'speaking' ? 'border-primary/40' :
                callState === 'thinking' ? 'border-primary/20' :
                'border-outline-variant/10'
              }`} />

              {/* Inner pulse */}
              {callActive && (
                <div className={`absolute inset-3 rounded-full transition-all duration-700 ${
                  callState === 'listening' ? 'bg-emerald-400/10 scale-100' :
                  callState === 'speaking' ? 'bg-primary/10 scale-110' :
                  callState === 'thinking' ? 'bg-primary/5 scale-95' :
                  'bg-transparent scale-90'
                }`} />
              )}

              {/* Icon */}
              <span className={`material-symbols-outlined text-5xl sm:text-6xl transition-colors duration-300 ${STATE_COLORS[callState]}`}
                style={{ fontVariationSettings: "'FILL' 1" }}>
                {callActive ? (
                  callState === 'listening' ? 'mic' :
                  callState === 'speaking' ? 'volume_up' :
                  callState === 'thinking' ? 'psychology' :
                  'mic'
                ) : 'call'}
              </span>
            </div>

            {/* State label */}
            <p className={`text-sm font-medium transition-colors ${STATE_COLORS[callState]}`}>
              {STATE_LABELS[callState]}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-error/10 border border-error/20 rounded-xl px-4 py-3 max-w-sm">
              <p className="text-error text-sm text-center">{error}</p>
            </div>
          )}

          {/* Call button */}
          <button
            onClick={callActive ? endCall : startCall}
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all ${
              callActive
                ? 'bg-error hover:bg-error/80'
                : 'signature-glow hover:shadow-[0_4px_30px_rgba(255,144,109,0.5)]'
            }`}
          >
            <span className="material-symbols-outlined text-3xl sm:text-4xl text-white"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              {callActive ? 'call_end' : 'call'}
            </span>
          </button>
        </div>

        {/* Transcript panel */}
        <div className="w-full flex-shrink-0 max-h-[40vh] sm:max-h-[35vh]">
          {(transcript.length > 0 || assistantPartial) ? (
            <div className="bg-surface-container rounded-2xl p-4 overflow-y-auto max-h-full border border-outline-variant/10">
              <div className="space-y-3">
                {transcript.map((entry, i) => (
                  <div key={i} className={`flex gap-3 ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {entry.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-primary text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>face</span>
                      </div>
                    )}
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                      entry.role === 'user'
                        ? 'bg-surface-container-high text-on-surface'
                        : 'bg-surface-container-highest/50 text-on-surface-variant'
                    }`}>
                      {entry.text}
                    </div>
                  </div>
                ))}

                {/* Partial assistant response */}
                {assistantPartial && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-primary text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>face</span>
                    </div>
                    <div className="max-w-[80%] px-3 py-2 rounded-xl text-sm bg-surface-container-highest/50 text-on-surface-variant">
                      {assistantPartial}
                      <span className="inline-block w-1.5 h-4 bg-primary/50 ml-0.5 animate-pulse" />
                    </div>
                  </div>
                )}

                <div ref={transcriptEndRef} />
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-on-surface-variant/30 text-sm">
                {callActive ? 'Start talking...' : 'Tap the call button to start a voice call'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
