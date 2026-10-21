/* ============================================================================
   Tailwind CSS — teacher panel only (teacher.html)
   ----------------------------------------------------------------------------
   The teacher panel was rewritten on Tailwind utilities in 2026-10-21. This
   configuration keeps the build strictly scoped:

   • `important: '.teacher-reference'` prefixes every generated utility with the
     body class teacher.html alone carries, so even if this sheet were ever
     linked from student/admin/manager/payment nothing would leak into them.
   • preflight is off: the shared fifteen-sheet cascade owns the global reset,
     typography and tokens; Tailwind supplies utilities + the components layer.
   • colours are palette tokens from css/foundation.css, never literals, so the
     light and AMOLED themes self-theme from the same build.

   Run `npm run build:teacher-css` after editing teacher.html or
   css/tailwind/teacher.src.css; the compiled stylesheet css/teacher-panel.css
   is committed because GitHub Pages serves static files without a build step.
   ========================================================================== */
module.exports = {
  content: [
    './teacher.html',
    './js/teacher.js',
    './js/teacher-*.js',
    './js/status-surface.js'
  ],
  corePlugins: { preflight: false },
  important: '.teacher-reference',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        line: 'var(--color-border)',
        ink: 'var(--color-text)',
        'ink-soft': 'var(--color-text-secondary)',
        'ink-mute': 'var(--color-text-muted)',
        brand: 'var(--color-primary)',
        'brand-hover': 'var(--color-primary-hover)',
        'brand-2': 'var(--brand-2)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        'on-hero': 'var(--pay-on-hero)',
        'on-hero-soft': 'var(--pay-on-hero-soft)'
      },
      borderRadius: {
        tile: 'var(--t-radius-tile)',
        card: 'var(--t-radius-card)',
        chip: 'var(--t-radius-chip)'
      },
      boxShadow: {
        glass: 'var(--glass-shadow)',
        'glass-strong': 'var(--glass-shadow-strong)'
      },
      fontFamily: {
        bn: ["'Noto Sans Bengali'", 'system-ui', 'sans-serif']
      },
      transitionTimingFunction: {
        teacher: 'var(--t-ease)'
      }
    }
  }
};
