import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        crypto: {
          bg: '#0a0a0f',
          bgSecondary: '#11111a',
          card: 'rgba(20, 20, 30, 0.8)',
          border: 'rgba(0, 245, 255, 0.2)',
          borderHover: 'rgba(0, 245, 255, 0.5)',
          primary: '#00f5ff',
          primaryDim: 'rgba(0, 245, 255, 0.15)',
          secondary: '#39ff14',
          accent: '#bc13fe',
          text: '#e8e8f0',
          textMuted: '#6b6b7b',
          error: '#ff3366',
          success: '#39ff14',
          warning: '#ffaa00',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'crypto-grid': 'linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)',
        'crypto-radial': 'radial-gradient(ellipse at center, rgba(0,245,255,0.08) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(0, 245, 255, 0.3), 0 0 40px rgba(0, 245, 255, 0.1)',
        'glow-accent': '0 0 20px rgba(188, 19, 254, 0.3), 0 0 40px rgba(188, 19, 254, 0.1)',
        'glow-success': '0 0 20px rgba(57, 255, 20, 0.3), 0 0 40px rgba(57, 255, 20, 0.1)',
        'card': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(0, 245, 255, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(0, 245, 255, 0.6), 0 0 60px rgba(0, 245, 255, 0.3)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config