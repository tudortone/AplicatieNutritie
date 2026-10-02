import * as Crypto from 'expo-crypto';

export type PlayIntegrityRequest = {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  payloadFingerprint?: string;
};

type PlayIntegrityDependencies = {
  platform: string;
  cloudProjectNumber: string;
  prepare: (cloudProjectNumber: string) => Promise<void>;
  requestToken: (requestHash: string) => Promise<string>;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
  }
  return value;
}

export async function buildPlayIntegrityRequestHash(input: PlayIntegrityRequest): Promise<string> {
  const canonical = [
    String(input.method || '').toUpperCase(),
    String(input.path || ''),
    String(input.idempotencyKey || ''),
    String(input.payloadFingerprint || ''),
    JSON.stringify(stableValue(input.body ?? {})),
  ].join('\n');
  const base64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createPlayIntegrityClient({
  platform,
  cloudProjectNumber,
  prepare,
  requestToken,
}: PlayIntegrityDependencies) {
  let prepared: Promise<void> | null = null;

  return Object.freeze({
    async headers(input: PlayIntegrityRequest): Promise<Record<string, string>> {
      if (platform !== 'android' || !/^\d+$/.test(cloudProjectNumber)) return {};
      try {
        if (!prepared) prepared = prepare(cloudProjectNumber);
        await prepared;
        const requestHash = await buildPlayIntegrityRequestHash(input);
        const token = await requestToken(requestHash);
        if (!token) return {};
        return {
          'X-Play-Integrity': token,
          'X-Play-Integrity-Request-Hash': requestHash,
        };
      } catch {
        prepared = null;
        return {};
      }
    },
  });
}
