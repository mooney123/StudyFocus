// StudyFocus Design Tokens
// Single source of truth for colours, spacing, typography and radii.
// Consumed by components and reflected in tailwind.config.js via CSS variables.

export const tokens = {
  colors: {
    primary:    '#3b82f6', // blue-500 — buttons, links, active states
    accent:     '#60a5fa', // blue-400 — hover states
    success:    '#22c55e', // green-500
    warning:    '#f59e0b', // amber-500
    error:      '#ef4444', // red-500
    // Surface scale (dark theme)
    bg:         '#191919',
    surface:    '#2f3437',
    surfaceAlt: '#1f2937',
    hover:      '#373c3f',
    border:     '#373c3f',
    borderLight:'#4b5563',
    // Text scale
    textPrimary:   '#ffffff',
    textSecondary: '#9ca3af',
    textMuted:     '#6b7280',
  },
  spacing: {
    xs:  '4px',
    sm:  '8px',
    md:  '16px',
    lg:  '24px',
    xl:  '32px',
    xxl: '48px',
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  fontSize: {
    xs:   '11px',
    sm:   '13px',
    base: '14px',
    md:   '16px',
    lg:   '18px',
    xl:   '20px',
    xxl:  '24px',
  },
};
