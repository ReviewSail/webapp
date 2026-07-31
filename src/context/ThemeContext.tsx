import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'reviewsail:theme';

type ThemeContextValue = {
  /** What the user chose. 'system' follows the OS. */
  theme: ThemePreference;
  /** What that actually resolves to right now. */
  resolved: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const readStored = (): ThemePreference => {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* private browsing */
  }
  return 'system';
};

/**
 * Applies the theme to <html>.
 *
 * Two things are set, and both matter:
 *   - the `dark` class, which is what Tailwind's darkMode:["class"] reads;
 *   - `color-scheme`, which tells the browser the page has a real theme of its
 *     own. Without it Chrome's auto-dark will machine-invert the light design,
 *     which is what made the app look half-finished on dark-mode machines.
 *
 * Exported and duplicated as an inline script in index.html so the first paint
 * is already correct — a React effect runs too late to avoid a flash.
 */
export const applyTheme = (resolved: ResolvedTheme) => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    readStored() === 'system' ? (prefersDark() ? 'dark' : 'light') : (readStored() as ResolvedTheme)
  );

  // Re-resolve whenever the preference changes, and keep following the OS for
  // as long as the preference is 'system'.
  useEffect(() => {
    const compute = (): ResolvedTheme =>
      theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;

    const sync = () => {
      const next = compute();
      setResolved(next);
      applyTheme(next);
    };

    sync();

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* preference is still applied for this session */
    }
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
