import type { Config } from "tailwindcss";

/** A status tone (src/index.css --status-<tone>-fg/-bg/-line) with opacity support. */
const tone = (name: string) => ({
  fg: `hsl(var(--status-${name}-fg) / <alpha-value>)`,
  bg: `hsl(var(--status-${name}-bg) / <alpha-value>)`,
  line: `hsl(var(--status-${name}-line) / <alpha-value>)`,
});

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  // hover: utilities apply only on devices that can really hover, so a tap on a
  // phone never leaves a card stuck in its hover state.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1440px",
      },
    },
    extend: {
      // Fonts come from --font-heading / --font-body in src/index.css. `poppins` and
      // `serif` are kept as class names so existing markup follows the theme.
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        poppins: ['var(--font-body)'],
        sans: ['var(--font-body)'],
        serif: ['var(--font-heading)'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        cream: {
          DEFAULT: "hsl(var(--cream))",
          dark: "hsl(var(--cream-dark))",
        },
        highlight: {
          DEFAULT: "hsl(var(--highlight) / <alpha-value>)",
          foreground: "hsl(var(--highlight-foreground) / <alpha-value>)",
          soft: "hsl(var(--highlight-soft) / <alpha-value>)",
        },
        charcoal: {
          DEFAULT: "hsl(var(--charcoal) / <alpha-value>)",
          foreground: "hsl(var(--charcoal-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          dark: "hsl(var(--primary-dark))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // text-status-success-fg, bg-status-danger-bg, border-status-info-line ...
        status: {
          success: tone("success"),
          danger: tone("danger"),
          warning: tone("warning"),
          info: tone("info"),
          returns: tone("returns"),
          neutral: tone("neutral"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // The Ishaputra scale: panels and dialogs, cards and menus, controls, chips.
        panel: "var(--radius-panel)",
        card: "var(--radius-card)",
        control: "6px",
        chip: "4px",
      },
      // Opacity steps already used as /6, /7, /8 ... in class names.
      opacity: {
        "6": "0.06",
        "7": "0.07",
        "8": "0.08",
        "11": "0.11",
        "12": "0.12",
        "18": "0.18",
        "28": "0.28",
        "42": "0.42",
      },
      zIndex: {
        raised: "var(--z-raised)",
        sticky: "var(--z-sticky)",
        header: "var(--z-header)",
        overlay: "var(--z-overlay)",
        drawer: "var(--z-drawer)",
        popover: "var(--z-popover)",
        toast: "var(--z-toast)",
        loader: "var(--z-loader)",
        grain: "var(--z-grain)",
      },
      // Deliberately overrides Tailwind's own ease-out / ease-in-out with the strong curves.
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
        drawer: "var(--ease-drawer)",
      },
      transitionDuration: {
        press: "140ms",
        hover: "150ms",
        tooltip: "160ms",
        dropdown: "200ms",
        modal: "240ms",
        drawer: "300ms",
        exit: "180ms",
        reveal: "320ms",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        'luxury-sm': '0 2px 8px rgba(17, 17, 17, 0.04)',
        'luxury-md': '0 6px 20px rgba(17, 17, 17, 0.06)',
        'luxury-lg': '0 12px 32px rgba(17, 17, 17, 0.08)',
        'luxury-xl': '0 20px 40px rgba(17, 17, 17, 0.1)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-left": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 200ms var(--ease-out)",
        "accordion-up": "accordion-up 180ms var(--ease-out)",
        "fade-in": "fade-in 240ms var(--ease-out) both",
        "fade-in-left": "fade-in-left 240ms var(--ease-out) both",
        "fade-in-right": "fade-in-right 240ms var(--ease-out) both",
        "scale-in": "scale-in 200ms var(--ease-out) both",
        "slide-in-bottom": "slide-in-bottom 300ms var(--ease-drawer) both",
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
