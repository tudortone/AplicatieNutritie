function safeOwner(ownerId: string): string {
  const normalized = ownerId.trim();
  if (!normalized) throw new Error('OWNER_ID_REQUIRED');
  return encodeURIComponent(normalized);
}

export function templateCacheKey(ownerId: string): string {
  return `getflow:workout-v2:templates:${safeOwner(ownerId)}`;
}

export function activeSessionKey(ownerId: string): string {
  return `getflow:workout-v2:active:${safeOwner(ownerId)}`;
}

