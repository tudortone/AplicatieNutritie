import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeName, ThemeColors, getThemeColors } from '../constants/theme';

const STORAGE_KEY = 'nutriai_theme';

interface ThemeContextType {
  themeName: ThemeName;
  colors: ThemeColors;
  setTheme: (name: ThemeName) => void;
}

const defaultColors = getThemeColors('midnight');

const ThemeContext = createContext<ThemeContextType>({
  themeName: 'midnight',
  colors: defaultColors,
  setTheme: () => {},
});

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('midnight');
  const [colors, setColors] = useState<ThemeColors>(defaultColors);

  // Încarcă tema salvată la pornire
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && (saved === 'midnight' || saved === 'ocean' || saved === 'sunset')) {
        setThemeName(saved as ThemeName);
        setColors(getThemeColors(saved as ThemeName));
      }
    });
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    setColors(getThemeColors(name));
    AsyncStorage.setItem(STORAGE_KEY, name);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeName, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
