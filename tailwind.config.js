/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Variable Inter, bundled via @fontsource-variable/inter in main.tsx.
        // The fallbacks keep metrics close if the face is still loading.
        sans: [
          '"Inter Variable"',
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        // Brand ramp — see src/index.css for the values and the one-gradient rule.
        brand: {
          50: "hsl(var(--brand-50) / <alpha-value>)",
          100: "hsl(var(--brand-100) / <alpha-value>)",
          200: "hsl(var(--brand-200) / <alpha-value>)",
          300: "hsl(var(--brand-300) / <alpha-value>)",
          400: "hsl(var(--brand-400) / <alpha-value>)",
          500: "hsl(var(--brand-500) / <alpha-value>)",
          600: "hsl(var(--brand-600) / <alpha-value>)",
          700: "hsl(var(--brand-700) / <alpha-value>)",
          800: "hsl(var(--brand-800) / <alpha-value>)",
          900: "hsl(var(--brand-900) / <alpha-value>)",
          950: "hsl(var(--brand-950) / <alpha-value>)",
        },

        // Neutrals
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        ink: {
          DEFAULT: "hsl(var(--ink) / <alpha-value>)",
          muted: "hsl(var(--ink-muted) / <alpha-value>)",
          faint: "hsl(var(--ink-faint) / <alpha-value>)",
        },

        // Star ratings only.
        star: "hsl(var(--star) / <alpha-value>)",

        // State only — never decoration.
        positive: {
          DEFAULT: "hsl(var(--positive) / <alpha-value>)",
          soft: "hsl(var(--positive-soft) / <alpha-value>)",
        },
        caution: {
          DEFAULT: "hsl(var(--caution) / <alpha-value>)",
          soft: "hsl(var(--caution-soft) / <alpha-value>)",
        },
        critical: {
          DEFAULT: "hsl(var(--critical) / <alpha-value>)",
          soft: "hsl(var(--critical-soft) / <alpha-value>)",
        },

        // shadcn aliases
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Depth is reserved for things that genuinely float — menus, toasts, the
      // guest drawer. Resting surfaces get a hairline border instead, which is
      // why there is no card shadow in this scale.
      boxShadow: {
        pop: "0 8px 24px -6px hsl(var(--brand-950) / 0.16), 0 2px 6px -2px hsl(var(--brand-950) / 0.08)",
        float: "0 16px 40px -12px hsl(var(--brand-950) / 0.24)",
      },
      // animate-fade-in and animate-slide-in were already used by the modals and
      // the guest drawer, but were never defined anywhere, so they did nothing.
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(0.5rem)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // The pipeline segments draw themselves in on first paint.
        "grow-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-in": "slide-in 200ms ease-out",
        "toast-in": "toast-in 180ms ease-out",
        "grow-x": "grow-x 520ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
}
