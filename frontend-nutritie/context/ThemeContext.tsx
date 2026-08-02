import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName, ThemeColors, ThemeDecor, getThemeColors, getThemeDecor } from '../constants/theme';

const STORAGE_KEY = 'nutriai_theme';

interface ThemeContextType {
  themeName: ThemeName;
  colors: ThemeColors;
  decor: ThemeDecor;
  setTheme: (name: ThemeName) => void;
}

const defaultColors = getThemeColors('midnight');
const defaultDecor = getThemeDecor('midnight');

const ThemeContext = createContext<ThemeContextType>({
  themeName: 'midnight',
  colors: defaultColors,
  decor: defaultDecor,
  setTheme: () => {},
});

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('midnight');
  const [colors, setColors] = useState<ThemeColors>(defaultColors);
  const [decor, setDecor] = useState<ThemeDecor>(defaultDecor);

  // Încarcă tema salvată la pornire
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && (saved === 'midnight' || saved === 'ocean' || saved === 'sunset')) {
        setThemeName(saved as ThemeName);
        setColors(getThemeColors(saved as ThemeName));
        setDecor(getThemeDecor(saved as ThemeName));
      }
    });
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    setColors(getThemeColors(name));
    setDecor(getThemeDecor(name));
    AsyncStorage.setItem(STORAGE_KEY, name);
  }, []);

  const value = React.useMemo(() => ({
    themeName, colors, decor, setTheme
  }), [themeName, colors, decor, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
