import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // New Color Palette
        primary: {
          50: '#f7f8fa',   // Very light charcoal
          100: '#e8ecf1',  // Light charcoal
          200: '#c8d4dd',  // Pale charcoal
          300: '#99aebf',  // Light charcoal
          400: '#6b8799',  // Medium charcoal
          500: '#264653',  // Charcoal (base)
          600: '#203b45',  // Dark charcoal
          700: '#1a3037',  // Deeper charcoal
          800: '#15262a',  // Very dark charcoal
          900: '#101d22',  // Almost black charcoal
          950: '#0a1317',  // Black charcoal
        },
        secondary: {
          50: '#fffdf7',   // Very light persian-green
          100: '#f2f9f7',  // Light persian-green
          200: '#e3f3ef',  // Pale persian-green
          300: '#d3ecde',  // Light persian-green
          400: '#a7d9bd',  // Medium persian-green
          500: '#2a9d8f',  // Persian-green (base)
          600: '#248077',  // Dark persian-green
          700: '#1e645f',  // Deeper persian-green
          800: '#184950',  // Very dark persian-green
          900: '#12333c',  // Almost black persian-green
          950: '#0c1e23',  // Black persian-green
        },
        tertiary: {
          50: '#fffef7',   // Very light saffron
          100: '#fdfcde',  // Light saffron
          200: '#faf9bc',  // Pale saffron
          300: '#f7f69b',  // Light saffron
          400: '#f3f277',  // Medium saffron
          500: '#e9c46a',  // Saffron (base)
          600: '#d4a954',  // Dark saffron
          700: '#af903f',  // Deeper saffron
          800: '#8f7732',  // Very dark saffron
          900: '#6e5d26',  // Almost black saffron
          950: '#4a3f1b',  // Black saffron
        },
        accent: {
          50: '#fffef6',   // Very light sandy-brown
          100: '#fdf8df',  // Light sandy-brown
          200: '#f9ecc5',  // Pale sandy-brown
          300: '#f5e09a',  // Light sandy-brown
          400: '#f1d470',  // Medium sandy-brown
          500: '#f4a261',  // Sandy-brown (base)
          600: '#ed8b4e',  // Dark sandy-brown
          700: '#dc7b3e',  // Deeper sandy-brown
          800: '#c76b30',  // Very dark sandy-brown
          900: '#a55726',  // Almost black sandy-brown
          950: '#783d19',  // Black sandy-brown
        },
        danger: {
          50: '#fef2f2',   // Very light burnt-sienna
          100: '#fceaea',  // Light burnt-sienna
          200: '#f5d4d0',  // Pale burnt-sienna
          300: '#eebbb3',  // Light burnt-sienna
          400: '#e6958b',  // Medium burnt-sienna
          500: '#e76f51',  // Burnt-sienna (base)
          600: '#d65f45',  // Dark burnt-sienna
          700: '#b54e39',  // Deeper burnt-sienna
          800: '#95402f',  // Very dark burnt-sienna
          900: '#743226',  // Almost black burnt-sienna
          950: '#4a1f19',  // Black burnt-sienna
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
} satisfies Config
