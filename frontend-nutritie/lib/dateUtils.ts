/**
 * Utilitați pentru date și timp
 */

/**
 * Returnează data locală sub formă de string 'YYYY-MM-DD',
 * corectând problemele apărute la utilizarea UTC-ului (ex. mese adăugate la 00:30 noaptea 
 * care apăreau în ziua precedentă).
 * 
 * @param date Data pentru care se vrea cheia (implicit now)
 * @returns String în formatul 'YYYY-MM-DD'
 */
export const localDayKey = (date: Date = new Date()): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Returnează începutul zilei curente (sau specificate) în timezone-ul local, 
 * formatat ca string ISO, perfect pentru filtrări `.gte('created_at', ...)` în Supabase.
 */
export const startOfLocalDayISO = (date: Date = new Date()): string => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Returnează finalul zilei curente (sau specificate) în timezone-ul local,
 * formatat ca string ISO, util pentru filtrări `.lte('created_at', ...)` în Supabase.
 */
export const endOfLocalDayISO = (date: Date = new Date()): string => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};
