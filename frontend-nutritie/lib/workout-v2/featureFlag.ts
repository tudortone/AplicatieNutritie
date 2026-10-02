export function isWorkoutV2PreviewEnabled(
  explicitFlag: string | undefined,
  isDevelopment: boolean,
): boolean {
  return isDevelopment || explicitFlag === 'true';
}

export function canAccessWorkoutV2PreviewWithoutSession(
  pathname: string,
  explicitFlag: string | undefined,
  isDevelopment: boolean,
): boolean {
  return pathname === '/workout-v2-preview'
    && isWorkoutV2PreviewEnabled(explicitFlag, isDevelopment);
}
