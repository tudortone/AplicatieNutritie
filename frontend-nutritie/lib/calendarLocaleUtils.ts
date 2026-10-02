/**
 * Calendar and Locale Date Utilities for GetFlow
 * Supports dynamic localization (RO, EN, FR, DE) with zero hardcoded language strings.
 */

export const getLocaleTag = (language?: string): string => {
  if (!language) return 'ro-RO';
  const lang = language.toLowerCase();
  if (lang.startsWith('en')) return 'en-US';
  if (lang.startsWith('fr')) return 'fr-FR';
  if (lang.startsWith('de')) return 'de-DE';
  return 'ro-RO';
};

/**
 * Returns Monday (00:00:00.000 local) of the week containing the given date.
 */
export const getMondayOfWeek = (d: Date): Date => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Returns the 7 consecutive dates (Monday through Sunday) for the week containing anchorDate.
 */
export const getWeekDays = (anchorDate: Date): Date[] => {
  const monday = getMondayOfWeek(anchorDate);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
};

/**
 * Returns clean capitalized short weekday name (e.g., "Lun", "Mon", "Mer", "Di").
 */
export const formatWeekdayShort = (date: Date, localeTag: string): string => {
  const raw = date.toLocaleDateString(localeTag, { weekday: 'short' });
  const clean = raw.replace(/\./g, '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

/**
 * Returns localized narrow initial for week header (Sunday to Saturday or Monday to Sunday).
 */
export const formatWeekdayNarrow = (date: Date, localeTag: string): string => {
  const raw = date.toLocaleDateString(localeTag, { weekday: 'narrow' });
  return raw.replace(/\./g, '').trim().toUpperCase();
};

/**
 * Returns Sunday-first 7 localized weekday header initials for month grid.
 */
export const getMonthGridWeekdayHeaders = (localeTag: string): string[] => {
  // 2026-09-27 was a Sunday
  const sundayBase = new Date(2026, 8, 27);
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = new Date(sundayBase.getFullYear(), sundayBase.getMonth(), sundayBase.getDate() + i);
    return formatWeekdayNarrow(d, localeTag);
  });
};

/**
 * Capitalizes localized Month and Year (e.g., "Septembrie 2026", "September 2026").
 */
export const formatMonthYear = (date: Date, localeTag: string): string => {
  const month = date.toLocaleDateString(localeTag, { month: 'long' });
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalized} ${date.getFullYear()}`;
};

/**
 * Capitalizes localized Month name (e.g., "Septembrie", "September").
 */
export const formatMonthName = (monthIndex: number, year: number, localeTag: string): string => {
  const date = new Date(year, monthIndex, 1);
  const month = date.toLocaleDateString(localeTag, { month: 'long' });
  return month.charAt(0).toUpperCase() + month.slice(1);
};

/**
 * Full accessible date string (e.g., "29 septembrie 2026", "September 29, 2026").
 */
export const formatFullDate = (date: Date, localeTag: string): string => {
  return date.toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Compares two dates by local calendar day (YYYY-MM-DD).
 */
export const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};
