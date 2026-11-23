const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  // le classi `dark:` seguono i tre blocchi del tema (automatico / scuro manuale), non solo prefers-color-scheme
  darkMode: ['variant', ['@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }', ':root[data-theme="dark"] &']],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'), surface: token('surface'), ink: token('ink'), muted: token('muted'), line: token('line'),
        brand: token('brand'), onbrand: token('onbrand'), inc: token('inc'), exp: token('exp'), trf: token('trf'), warn: token('warn'),
      },
      fontFamily: {
        sans: ['ui-rounded', 'SF Pro Rounded', 'Nunito', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        sheet: { from: { transform: 'translateY(48px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        float1: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(40px,30px,0)' } },
        float2: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(-50px,40px,0)' } },
        float3: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(30px,-40px,0)' } },
      },
      animation: {
        sheet: 'sheet .3s ease-out', fade: 'fade .2s ease-out',
        float1: 'float1 18s ease-in-out infinite', float2: 'float2 22s ease-in-out infinite', float3: 'float3 26s ease-in-out infinite',
      },
    },
  },
}
