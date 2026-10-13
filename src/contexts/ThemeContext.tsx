import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BRAND } from '@/config/brand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const THEME_KEY = BRAND.storageKeys.theme;
/** New visitors start in light mode (owner decision, 2026-10-13). index.html's pre-paint script uses the same default. */
const DEFAULT_THEME: Theme = 'light';

/** Browser-bar colours: the page background of each theme. */
const THEME_COLOR = { light: '#F6F2EB', dark: '#0E0D0C' } as const;

function getSystemTheme(): 'light' | 'dark' {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Put the resolved theme on <html>. Every transition is switched off for one
 * frame so the whole page snaps to the new colours instead of smearing through
 * hundreds of colour transitions at once.
 */
function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  const alreadyApplied = root.classList.contains(resolved) && root.style.colorScheme === resolved;

  if (!alreadyApplied) {
    root.classList.add('theme-switching');
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
    // Force a style flush while transitions are off, then restore them next frame.
    void window.getComputedStyle(root).opacity;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => root.classList.remove('theme-switching'));
    });
  }

  // A chosen theme overrides the device preference, so both theme-color metas
  // carry the chosen colour; 'system' keeps one per media query (index.html).
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', THEME_COLOR[resolved]);
  });
}

function resetThemeColorToSystem() {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('media') || '';
    meta.setAttribute('content', media.includes('dark') ? THEME_COLOR.dark : THEME_COLOR.light);
  });
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? getSystemTheme() : theme
  );

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // Private mode or blocked storage: the choice lasts for this visit only.
    }
  }, []);

  useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    applyTheme(resolved);
    if (theme === 'system') resetThemeColorToSystem();
  }, [theme]);

  // Follow the device while the theme is 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyTheme(resolved);
      resetThemeColorToSystem();
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
