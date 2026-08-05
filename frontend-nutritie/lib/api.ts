import { API_URL } from '../constants/config';

// B-18: prefixul API-ului versionat. Clientul migreaza treptat la /api/v1;
// aliasele legacy /api raman active in backend pana la EXPIRE 2026-09-30.
export const API_PREFIX = '/api/v1';

export function getCleanApiBaseUrl(): string {
  let base = (API_URL || '').trim();
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '');
  return base;
}

export function buildApiUrl(path: string): string {
  const base = getCleanApiBaseUrl();
  let cleanPath = (path || '').trim();
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }
  if (/^\/api\//i.test(cleanPath)) {
    return `${base}${cleanPath}`;
  }
  return `${base}${API_PREFIX}${cleanPath}`;
}
