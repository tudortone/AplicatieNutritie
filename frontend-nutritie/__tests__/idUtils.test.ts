const mockRandomUuid = jest.fn(() => '123e4567-e89b-42d3-a456-426614174000');

jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUuid(),
}));

import { generareUuid, generareUuidDeterminist } from '../lib/idUtils';

describe('idUtils', () => {
  it('generează UUID-urile noi prin sursa criptografică Expo', () => {
    expect(generareUuid()).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(mockRandomUuid).toHaveBeenCalledTimes(1);
  });

  it('păstrează un ID determinist stabil pentru retry-ul aceleiași operații', () => {
    const primul = generareUuidDeterminist('user|meal|2026-08-19');
    expect(generareUuidDeterminist('user|meal|2026-08-19')).toBe(primul);
    expect(generareUuidDeterminist('user|meal|2026-08-20')).not.toBe(primul);
    expect(primul).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
