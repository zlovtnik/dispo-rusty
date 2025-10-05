import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Natural Pharmacy Color System
        primary: {
          50: '#f0f9f4',   // Very light sage green
          100: '#dcf2e6',  // Light sage green
          200: '#bae6d0',  // Pale sage green
          300: '#7ecf9b',  // Light sage green
          400: '#4bb574',  // Medium sage green
          500: '#2d9d5a',  // Sage green
          600: '#26844d',  // Dark sage green
          700: '#1f6b3e',  // Deep sage green
          800: '#1a5632',  // Very dark sage green
          900: '#153f27',  // Almost black sage green
          950: '#0c1f14',  // Black sage green
        },
        secondary: {
          50: '#fef3e7',   // Very light cream
          100: '#fce7c6',  // Light cream
          200: '#f8d49c',  // Pale cream
          300: '#f2c071',  // Light cream
          400: '#ebb447',  // Medium cream
          500: '#e29e26',  // Golden honey
          600: '#cc8a20',  // Dark golden honey
          700: '#aa6f1c',  // Browner honey
          800: '#8c5819',  // Dark honey brown
          900: '#744619',  // Very dark honey brown
          950: '#3d230c',  // Black honey brown
        },
        tertiary: {
          50: '#f7f4f0',   // Very light earth brown
          100: '#ede2d0',  // Light earth brown
          200: '#ddcdb4',  // Pale earth brown
          300: '#c8b090',  // Medium light earth brown
          400: '#b2946c',  // Medium earth brown
          500: '#9d7948',  // Earth brown
          600: '#7d5e39',  // Dark earth brown
          700: '#654a2d',  // Deeper earth brown
          800: '#503724',  // Very dark earth brown
          900: '#3f2c1d',  // Almost black earth brown
          950: '#24170e',  // Black earth brown
        },
        accent: {
          50: '#f0fdf6',   // Very light mint green
          100: '#dcfce7',  // Light mint green
          200: '#bbf7d0',  // Pale mint green
          300: '#86efac',  // Light mint green
          400: '#4ade80',  // Medium mint green
          500: '#22c55e',  // Mint green
          600: '#16a34a',  // Dark mint green
          700: '#15803d',  // Deeper mint green
          800: '#166534',  // Very dark mint green
          900: '#14532d',  // Almost black mint green
          950: '#052e16',  // Black mint green
        },
        neutral: {
          50: '#fafaf9',   // Very light beige
          100: '#f5f5f4',  // Light beige
          200: '#e7e5e4',  // Pale beige
          300: '#d6d3d1',  // Light gray beige
          400: '#a8a29e',  // Medium gray beige
          500: '#78716c',  // Gray beige
          600: '#57534e',  // Dark gray beige
          700: '#44403c',  // Deeper gray beige
          800: '#292524',  // Very dark gray beige
          900: '#1c1917',  // Almost black gray beige
          950: '#0c0a09',  // Black gray beige
        },
        // Semantic color aliases
        healing: {
          light: '#dcf2e6',  // Light sage for positive actions
          dark: '#1f6b3e',   // Dark sage for headings
        },
        natural: {
          light: '#f7f4f0',  // Light earth for backgrounds
          dark: '#7d5e39',   // Dark earth for text
        },
        wellness: {
          light: '#f0fdf6',  // Light mint for success
          dark: '#166534',   // Dark mint for strong emphasis
        }
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
