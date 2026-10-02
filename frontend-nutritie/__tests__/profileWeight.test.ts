import { resolveProfileWeightKg } from '../lib/profileWeight';

describe('resolveProfileWeightKg', () => {
  it('prefers a valid user-scoped pending weight over metadata and storage', () => {
    expect(resolveProfileWeightKg({ pendingKg: 82, metadataKg: 70, storedKg: '68.5' })).toBe(82);
  });

  it('uses metadata before the locally restored value', () => {
    expect(resolveProfileWeightKg({ metadataKg: 70, storedKg: '68.5' })).toBe(70);
  });

  it('parses a finite numeric string from AsyncStorage', () => {
    expect(resolveProfileWeightKg({ storedKg: '68.5' })).toBe(68.5);
  });

  it('returns null when all available sources are invalid or missing', () => {
    expect(resolveProfileWeightKg({ pendingKg: Number.NaN, metadataKg: 0 })).toBeNull();
    expect(resolveProfileWeightKg({ storedKg: 'not-a-weight' })).toBeNull();
    expect(resolveProfileWeightKg({})).toBeNull();
  });

  it('rejects values outside the supported current-weight range', () => {
    expect(resolveProfileWeightKg({ pendingKg: 29.9, metadataKg: 251 })).toBeNull();
  });
});
