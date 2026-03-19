/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Surface system (warm dark)
        surface: {
          DEFAULT: '#110d0c',
          dim: '#110d0c',
          bright: '#312b28',
          container: {
            DEFAULT: '#1d1916',
            low: '#171210',
            high: '#241f1c',
            highest: '#2a2522',
            lowest: '#000000',
          },
          variant: '#2a2522',
          tint: '#ff906d',
        },
        // Text system
        'on-surface': {
          DEFAULT: '#fffbff',
          variant: '#b2a9a6',
        },
        'on-background': '#fffbff',
        // Primary (signature orange)
        primary: {
          DEFAULT: '#ff906d',
          dim: '#ff7348',
          container: '#ff784e',
          fixed: '#ff784e',
          'fixed-dim': '#f3683b',
        },
        'on-primary': {
          DEFAULT: '#5b1500',
          container: '#470e00',
          fixed: '#000000',
          'fixed-variant': '#571400',
        },
        'inverse-primary': '#ac350a',
        // Secondary (warm blush)
        secondary: {
          DEFAULT: '#ffccbc',
          dim: '#f0beae',
          container: '#613e33',
          fixed: '#ffccbc',
          'fixed-dim': '#f0beae',
        },
        'on-secondary': {
          DEFAULT: '#664237',
          container: '#f7c5b5',
          fixed: '#503025',
          'fixed-variant': '#704b3f',
        },
        // Tertiary (warm gold)
        tertiary: {
          DEFAULT: '#ffeaaf',
          dim: '#eacd71',
          container: '#f9db7d',
          fixed: '#f9db7d',
          'fixed-dim': '#eacd71',
        },
        'on-tertiary': {
          DEFAULT: '#695400',
          container: '#5f4c00',
          fixed: '#493a00',
          'fixed-variant': '#6b5600',
        },
        // Error
        error: {
          DEFAULT: '#ff716c',
          dim: '#d7383b',
          container: '#9f0519',
        },
        'on-error': '#490006',
        'on-error-container': '#ffa8a3',
        // Outline
        outline: {
          DEFAULT: '#7b7471',
          variant: '#4c4744',
        },
        // Inverse
        'inverse-surface': '#fff8f5',
        'inverse-on-surface': '#5a5451',
        // Legacy aliases for existing code
        bg: {
          primary: '#110d0c',
          sidebar: '#110d0c',
          surface: '#1d1916',
          input: '#2a2522',
          secondary: '#241f1c',
          hover: '#ffffff10',
        },
        text: {
          primary: '#fffbff',
          secondary: '#b2a9a6',
          muted: '#7b7471',
        },
        accent: {
          primary: '#ff906d',
          start: '#ff906d',
          end: '#ff784e',
        },
        border: {
          DEFAULT: '#4c474420',
          input: '#4c4744',
          focus: '#ff906d',
        },
        success: '#30D158',
        warning: '#ffeaaf',
        danger: '#ff716c',
        cyan: '#64D2FF',
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
      },
    },
  },
  plugins: [],
};
