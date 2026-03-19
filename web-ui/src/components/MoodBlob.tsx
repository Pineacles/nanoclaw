import type { MoodData } from '../hooks/useMood';

interface Props {
  mood: MoodData;
  collapsed?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const MOOD_COLORS: Record<string, string> = {
  sleeping: '#444441',
  tired: '#D3D1C7',
  chill: '#9FE1CB',
  focused: '#FAC775',
  playful: '#F4C0D1',
  soft: '#FBEAF0',
  annoyed: '#F09595',
  excited: '#FAC775',
  training: '#C0DD97',
  eating: '#F5C4B3',
  crying: '#B5D4F4',
};

const MOOD_CONFIG: Record<string, {
  blob: string;
  aura: string;
  blobAnim: string;
  auraAnim: string;
  blobStyle?: React.CSSProperties;
  eyeViewBox: string;
  eyeStroke: string;
  eyeStrokeWidth: number;
  leftEye: React.ReactNode;
  rightEye: React.ReactNode;
}> = {
  sleeping: {
    blob: '#2C2C2A', aura: 'rgba(44,44,42,0.4)',
    blobAnim: 'dead-still 8s ease-in-out infinite',
    auraAnim: 'aura-slow 8s ease-in-out infinite',
    eyeViewBox: '0 0 14 6', eyeStroke: '#444441', eyeStrokeWidth: 1.6,
    leftEye: <line x1={1} y1={3} x2={13} y2={3} />,
    rightEye: <line x1={1} y1={3} x2={13} y2={3} />,
  },
  tired: {
    blob: '#D3D1C7', aura: 'rgba(180,178,169,0.35)',
    blobAnim: 'gentle-bob 6s ease-in-out infinite',
    auraAnim: 'aura-slow 6s ease-in-out infinite',
    eyeViewBox: '0 0 14 10', eyeStroke: '#5F5E5A', eyeStrokeWidth: 1.8,
    leftEye: <path d="M1 4 Q7 8 13 4" />,
    rightEye: <path d="M1 4 Q7 8 13 4" />,
  },
  chill: {
    blob: '#9FE1CB', aura: 'rgba(29,158,117,0.25)',
    blobAnim: 'breathe 4.5s ease-in-out infinite',
    auraAnim: 'aura-slow 4.5s ease-in-out infinite',
    eyeViewBox: '0 0 14 10', eyeStroke: '#085041', eyeStrokeWidth: 1.8,
    leftEye: <path d="M1 7 Q7 1 13 7" />,
    rightEye: <path d="M1 7 Q7 1 13 7" />,
  },
  focused: {
    blob: '#FAC775', aura: 'rgba(186,117,23,0.3)',
    blobAnim: 'nod 3s ease-in-out infinite',
    auraAnim: 'aura-focused 3s ease-in-out infinite',
    blobStyle: { borderRadius: 14 },
    eyeViewBox: '0 0 14 8', eyeStroke: '#633806', eyeStrokeWidth: 2,
    leftEye: <line x1={1} y1={4} x2={13} y2={4} />,
    rightEye: <line x1={1} y1={4} x2={13} y2={4} />,
  },
  playful: {
    blob: '#F4C0D1', aura: 'rgba(212,83,126,0.2)',
    blobAnim: 'soft-morph 3s ease-in-out infinite',
    auraAnim: 'aura-slow 3s ease-in-out infinite',
    eyeViewBox: '0 0 14 10', eyeStroke: '#72243E', eyeStrokeWidth: 1.8,
    leftEye: <path d="M1 7 L7 2 L13 7" />,
    rightEye: <path d="M1 7 L7 2 L13 7" />,
  },
  soft: {
    blob: '#FBEAF0', aura: 'rgba(244,192,209,0.5)',
    blobAnim: 'float 5s ease-in-out infinite',
    auraAnim: 'aura-soft 5s ease-in-out infinite',
    blobStyle: { border: '1px solid #F4C0D1' },
    eyeViewBox: '0 0 14 10', eyeStroke: '#993556', eyeStrokeWidth: 1.6,
    leftEye: <path d="M2 5 Q7 9 12 5" />,
    rightEye: <path d="M2 5 Q7 9 12 5" />,
  },
  annoyed: {
    blob: '#F09595', aura: 'rgba(226,75,74,0.25)',
    blobAnim: 'tiny-shift 4s ease-in-out infinite',
    auraAnim: 'aura-annoy 4s ease-in-out infinite',
    eyeViewBox: '0 0 14 10', eyeStroke: '#791F1F', eyeStrokeWidth: 2,
    leftEye: <line x1={1} y1={2} x2={13} y2={7} />,
    rightEye: <line x1={1} y1={7} x2={13} y2={2} />,
  },
  excited: {
    blob: '#FAC775', aura: 'rgba(239,159,39,0.35)',
    blobAnim: 'soft-pulse 2s ease-in-out infinite',
    auraAnim: 'aura-excite 2s ease-in-out infinite',
    eyeViewBox: '0 0 16 10', eyeStroke: '#412402', eyeStrokeWidth: 2,
    leftEye: <path d="M1 8 Q8 0 15 8" />,
    rightEye: <path d="M1 8 Q8 0 15 8" />,
  },
  training: {
    blob: '#C0DD97', aura: 'rgba(99,153,34,0.3)',
    blobAnim: 'training-pulse 1.5s ease-in-out infinite',
    auraAnim: 'aura-excite 1.5s ease-in-out infinite',
    blobStyle: { borderRadius: '40% 60% 55% 45% / 55% 45% 60% 40%' },
    eyeViewBox: '0 0 14 8', eyeStroke: '#27500A', eyeStrokeWidth: 2.2,
    leftEye: <line x1={1} y1={4} x2={13} y2={4} />,
    rightEye: <line x1={1} y1={4} x2={13} y2={4} />,
  },
  eating: {
    blob: '#F5C4B3', aura: 'rgba(216,90,48,0.2)',
    blobAnim: 'eating-bob 2s ease-in-out infinite',
    auraAnim: 'aura-slow 2s ease-in-out infinite',
    eyeViewBox: '0 0 14 10', eyeStroke: '#993C1D', eyeStrokeWidth: 1.8,
    leftEye: <path d="M2 5 Q7 9 12 5" />,
    rightEye: <path d="M2 5 Q7 9 12 5" />,
  },
  crying: {
    blob: '#B5D4F4', aura: 'rgba(55,138,221,0.2)',
    blobAnim: 'cry-tremble 3s ease-in-out infinite',
    auraAnim: 'aura-soft 3s ease-in-out infinite',
    eyeViewBox: '0 0 14 10', eyeStroke: '#0C447C', eyeStrokeWidth: 1.8,
    leftEye: <path d="M1 4 Q7 8 13 4" />,
    rightEye: <path d="M1 4 Q7 8 13 4" />,
  },
};

const SIZES = {
  sm: { wrapper: 'w-[72px] h-[72px]', blob: 'w-[58px] h-[58px]', auraInset: '-8px', eyeW: 14, eyeH: 10, eyeGap: '11px' },
  md: { wrapper: 'w-[100px] h-[100px]', blob: 'w-[82px] h-[82px]', auraInset: '-10px', eyeW: 18, eyeH: 14, eyeGap: '14px' },
  lg: { wrapper: 'w-[140px] h-[140px]', blob: 'w-[116px] h-[116px]', auraInset: '-14px', eyeW: 24, eyeH: 18, eyeGap: '18px' },
};

export function MoodBlob({ mood, collapsed, size = 'sm' }: Props) {
  const moodName = mood.current_mood;
  const color = MOOD_COLORS[moodName] || MOOD_COLORS.chill;

  if (collapsed) {
    return (
      <div
        className="w-[22px] h-[22px] rounded-full transition-colors duration-700"
        style={{ background: color }}
      />
    );
  }

  const config = MOOD_CONFIG[moodName] || MOOD_CONFIG.chill;
  const s = SIZES[size];

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Blob + aura wrapper */}
      <div className={`relative ${s.wrapper} flex items-center justify-center`}>
        {/* Aura */}
        <div
          className="absolute rounded-full transition-all duration-700"
          style={{
            inset: s.auraInset,
            background: `radial-gradient(circle, ${config.aura}, transparent 70%)`,
            animation: config.auraAnim,
            ...(config.blobStyle?.borderRadius ? { borderRadius: config.blobStyle.borderRadius } : {}),
          }}
        />
        {/* Blob */}
        <div
          className={`${s.blob} rounded-full flex items-center justify-center transition-colors duration-700`}
          style={{
            background: config.blob,
            animation: config.blobAnim,
            borderRadius: config.blobStyle?.borderRadius ?? '50%',
            border: config.blobStyle?.border,
          }}
        >
          {/* Eyes */}
          <div className="flex -mt-1" style={{ gap: s.eyeGap }}>
            <svg
              viewBox={config.eyeViewBox}
              width={s.eyeW}
              height={s.eyeH}
              fill="none"
              stroke={config.eyeStroke}
              strokeWidth={config.eyeStrokeWidth}
              strokeLinecap="round"
            >
              {config.leftEye}
            </svg>
            <svg
              viewBox={config.eyeViewBox}
              width={s.eyeW}
              height={s.eyeH}
              fill="none"
              stroke={config.eyeStroke}
              strokeWidth={config.eyeStrokeWidth}
              strokeLinecap="round"
            >
              {config.rightEye}
            </svg>
          </div>
        </div>
      </div>

      {/* Labels */}
      <span className={`text-on-surface-variant capitalize ${size === 'lg' ? 'text-base font-semibold' : size === 'md' ? 'text-sm font-medium' : 'text-[11px]'}`}>
        {moodName}
      </span>
      {mood.activity && (
        <span className={`text-on-surface-variant/70 italic text-center leading-relaxed ${size === 'lg' ? 'text-sm max-w-[200px]' : size === 'md' ? 'text-xs max-w-[160px]' : 'text-[10px]'}`}>
          {mood.activity}
        </span>
      )}
    </div>
  );
}
