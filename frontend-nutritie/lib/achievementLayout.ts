/** Keeps two-column badges legible while allowing larger text to use full width. */
export function getAchievementGridColumns(width: number, fontScale: number): 1 | 2 {
  return width >= 390 && fontScale < 1.2 ? 2 : 1;
}
