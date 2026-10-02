'use strict';

const mockVerificariPeToken = new Map();
const mockGetUser = jest.fn(async (token) => {
  const numar = (mockVerificariPeToken.get(token) || 0) + 1;
  mockVerificariPeToken.set(token, numar);

  if (token === 'token-revocabil' && numar === 1) {
    return {
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'revocabil@example.com',
        },
      },
      error: null,
    };
  }
  if (token === 'token-valid-fara-context') {
    return {
      data: {
        user: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'valid@example.com',
        },
      },
      error: null,
    };
  }
  return {
    data: { user: null },
    error: { status: 401, message: 'Token revocat sau invalid.' },
  };
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

const request = require('supertest');
const app = require('../server');

describe('TASK-001 — decizia auth remote per cerere', () => {
  beforeEach(() => {
    mockVerificariPeToken.clear();
    mockGetUser.mockClear();
  });

  it('respinge la cererea 2 un token revocat dupa ce cererea 1 a fost valida', async () => {
    const prima = await request(app)
      .get('/api/ai-status')
      .set('Authorization', 'Bearer token-revocabil');
    const aDoua = await request(app)
      .get('/api/ai-status')
      .set('Authorization', 'Bearer token-revocabil');

    expect(prima.statusCode).toBe(200);
    expect(aDoua.statusCode).toBe(401);
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  it('nu declara RLS activ pe o ruta autentificata care nu construieste contextul de date', async () => {
    const raspuns = await request(app)
      .get('/api/ai-status')
      .set('Authorization', 'Bearer token-valid-fara-context');

    expect(raspuns.statusCode).toBe(200);
    expect(raspuns.headers).not.toHaveProperty('x-protectie-rls');
  });
});
