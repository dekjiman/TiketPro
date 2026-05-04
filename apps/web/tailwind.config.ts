import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: { 
    extend: {
      colors: {
        primary: '#065F46',
        secondary: '#64748B',
        tertiary: '#D97706',
      }
    } 
  },
  plugins: [],
};
export default config;