'use strict';

const { creeazaCheckAiUsageQuota } = require('../utils/aiUsageQuota');
const {
  creeazaMiddlewareIdempotenta,
  namespaceCerere,
} = require('../utils/idempotency');
const {
  construiesteGazdePermise,
  creeazaValideazaUrlImagine,
} = require('../utils/valideazaUrlImagine');

function raspunsFals() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(nume, valoare) { this.headers[nume] = valoare; },
    status(cod) { this.statusCode = cod; return this; },
    json(corp) { this.body = corp; return this; },
  };
}

describe('Remedieri selective adaptate din ramura Qredd', () => {
  test('cota AI foloseste un contor injectabil si blocheaza peste limita', async () => {
    let count = 0;
    const middleware = creeazaCheckAiUsageQuota({
      limitaZi: 1,
      contor: {
        increment: jest.fn(async () => ++count),
        ttl: jest.fn(async () => 3600),
      },
    });
    const req = { user: { id: 'utilizator-1' } };

    const primul = raspunsFals();
    const next = jest.fn();
    await middleware(req, primul, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(primul.headers['X-AI-Quota-Remaining']).toBe(0);

    const alDoilea = raspunsFals();
    await middleware(req, alDoilea, jest.fn());
    expect(alDoilea.statusCode).toBe(429);
    expect(alDoilea.body.cod).toBe('AI_QUOTA_EXCEEDED');
  });

  test('namespace-ul idempotentei nu poate fi falsificat doar prin JWT sub', () => {
    const reqA = { headers: { authorization: 'Bearer token-A' }, socket: {} };
    const reqB = { headers: { authorization: 'Bearer token-B' }, socket: {} };
    expect(namespaceCerere(reqA)).not.toBe(namespaceCerere(reqB));
    expect(namespaceCerere(reqA)).not.toContain('token-A');
  });

  test('idempotenta separa raspunsurile intre doua tokenuri', async () => {
    const map = new Map();
    const registru = {
      get: jest.fn(async (k) => map.get(k) || null),
      set: jest.fn(async (k, v) => { map.set(k, v); }),
    };
    const middleware = creeazaMiddlewareIdempotenta({ registru });

    const executa = async (token, corp) => {
      const req = {
        method: 'POST',
        originalUrl: '/api/mese',
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'aceeasi-cheie' },
        socket: {},
      };
      const res = raspunsFals();
      await middleware(req, res, () => res.json(corp));
      return res.body;
    };

    expect(await executa('token-A', { proprietar: 'A' })).toEqual({ proprietar: 'A' });
    expect(await executa('token-B', { proprietar: 'B' })).toEqual({ proprietar: 'B' });
  });

  test('validatorul SSRF refuza gazde, porturi si traversari nepermise', () => {
    const valideaza = creeazaValideazaUrlImagine({
      gazdePermise: new Set(['ik.imagekit.io']),
      folderPrefix: '/mancare/user-1/',
    });
    expect(valideaza('https://127.0.0.1/secret').ok).toBe(false);
    expect(valideaza('https://ik.imagekit.io:8443/mancare/user-1/a.jpg').ok).toBe(false);
    expect(valideaza('https://ik.imagekit.io/mancare/user-1/%2e%2e/alt/a.jpg').ok).toBe(false);
    expect(valideaza('https://ik.imagekit.io/mancare/user-1/a.jpg').ok).toBe(true);
  });

  test('N-01: accepta URL-urile ImageKit reale cu endpoint-id in cale, anti-IDOR pastrat', () => {
    // Formula reala de productie: endpoint-ul este `https://ik.imagekit.io/abc123`,
    // deci URL-urile intregi au `<endpoint-id>` ca segment de cale in pathname.
    const gazdePermise = construiesteGazdePermise({
      imagekitUrlEndpoint: 'https://ik.imagekit.io/abc123',
      supabaseUrl: 'https://proiect.supabase.co',
    });
    const valideaza = creeazaValideazaUrlImagine({
      gazdePermise,
      folderPrefix: '/mancare/user-1/',
    });

    // Folderul propriu al utilizatorului, cu endpoint-id in cale -> acceptat.
    expect(valideaza('https://ik.imagekit.io/abc123/mancare/user-1/x.jpg').ok).toBe(true);
    // URL care pointeaza spre folderul altui utilizator -> refuzat (anti-IDOR).
    expect(valideaza('https://ik.imagekit.io/abc123/mancare/user-2/x.jpg').ok).toBe(false);
  });
});
