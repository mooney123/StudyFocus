/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--sf-primary)',
        secondary: 'var(--sf-secondary)',
        background: 'var(--sf-background)',
        surface: 'var(--sf-surface)',
        text: 'var(--sf-text)',
        muted: 'var(--sf-muted)',
        border: 'var(--sf-border)',
        accent: 'var(--sf-accent)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Don't reset CSS — keeps existing styles intact
  },
}

