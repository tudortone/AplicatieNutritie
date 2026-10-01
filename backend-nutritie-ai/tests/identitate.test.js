'use strict';

jest.mock('@clerk/express', () => ({
  verifyToken: jest.fn(),
}));

/**
 * C1-S1: contractul favorizează calea Supabase (RLS). Un token Supabase valid
 * trebuie rezolvat ca `provider: 'supabase'` — singura cale pe care clientul cu
 * RLS se poate construi. Token-urile Clerk sunt WEBHOOK ONLY și nu sunt acceptate
 * ca bearer fallback pe endpointurile ordinare.
 *
 * Aceste teste nu ating rețeaua: `rezolvaIdentitate` primește obiectele `supabase`
 * și `supabaseAdmin` prin injecție de dependență, deci simulăm doar fake-uri.
 */

const { rezolvaIdentitate, EroareIdentitate, citesteExpiraLaMs } = require('../utils/identitate');

const UUID = '11111111-1111-4111-8111-111111111111';

function supabaseCon(getUserImpl) {
  return { auth: { getUser: getUserImpl } };
}

function getUserSucces(userOverride = {}) {
  return async () => ({
    data: {
      user: {
        id: UUID,
        email: 'a@b.ro',
        app_metadata: {},
        ...userOverride,
      },
    },
    error: null,
  });
}

function getUserEroare(error) {
  return async () => ({ data: { user: null }, error });
}

describe('identitate (C1-S1 supabase-first)', () => {
  it('TASK-001: un bearer respins de Supabase nu este acceptat prin Clerk pe endpointuri ordinare', async () => {
    const clerk = require('@clerk/express');
    clerk.verifyToken.mockResolvedValueOnce({
      sub: 'user_clerk_123',
      email: 'legacy@example.com',
    });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { supabase_user_id: UUID },
        error: null,
      }),
    };
    const supabaseAdmin = { from: jest.fn(() => query) };

    await expect(rezolvaIdentitate({
      token: 'jwt-clerk-valid',
      supabase: supabaseCon(getUserEroare({ status: 401, message: 'invalid' })),
      supabaseAdmin,
      clerkSecretKey: 'sk_secret',
    })).rejects.toMatchObject({ status: 401, cod: 'TOKEN_INVALID' });
    expect(clerk.verifyToken).not.toHaveBeenCalled();
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('un token Supabase valid se rezolva ca provider supabase (calea RLS)', async () => {
    const utilizator = await rezolvaIdentitate({
      token: 'jwt-supabase-valid',
      supabase: supabaseCon(getUserSucces()),
      supabaseAdmin: {},
      clerkSecretKey: 'sk_secret',
    });
    expect(utilizator).toMatchObject({
      id: UUID,
      provider: 'supabase',
      esteAdmin: false,
      esteTester: false,
      email: 'a@b.ro',
    });
  });

  it('acorda tester numai din app_metadata.full_access strict true', async () => {
    const utilizator = await rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserSucces({
        app_metadata: { full_access: true },
      })),
    });

    expect(utilizator).toMatchObject({ esteTester: true, esteAdmin: false });
  });

  it('ignora full_access falsificat in user_metadata', async () => {
    const utilizator = await rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserSucces({
        user_metadata: { full_access: true },
        app_metadata: {},
      })),
    });

    expect(utilizator).toMatchObject({ esteTester: false, esteAdmin: false });
  });

  it('rolul de admin se citeste doar din app_metadata.rol, nu user_metadata', async () => {
    const utilizator = await rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserSucces({
        user_metadata: { rol: 'admin' }, // manipulabil de user, nu trebuie respectat
        app_metadata: { rol: 'admin' },
      })),
      supabaseAdmin: {},
      clerkSecretKey: 'x',
    });
    expect(utilizator.esteAdmin).toBe(true);
  });

  it('un utilizator cu rol doar in user_metadata nu devine admin', async () => {
    const utilizator = await rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserSucces({
        user_metadata: { rol: 'admin' },
        app_metadata: {},
      })),
      supabaseAdmin: {},
      clerkSecretKey: 'x',
    });
    expect(utilizator.esteAdmin).toBe(false);
  });

  it('eroare de transport GoTrue (status 0) NU deconecteaza — 503 AUTH_INDISPONIBIL', async () => {
    await expect(rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserEroare({ status: 0, message: 'retea' })),
      supabaseAdmin: {},
      clerkSecretKey: 'x',
    })).rejects.toMatchObject({ status: 503, cod: 'AUTH_INDISPONIBIL' });
  });

  it('eroare GoTrue 5xx -> 503, nu 401', async () => {
    await expect(rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserEroare({ status: 500, message: 'boom' })),
      supabaseAdmin: {},
      clerkSecretKey: 'x',
    })).rejects.toMatchObject({ status: 503, cod: 'AUTH_INDISPONIBIL' });
  });

  it('CONTROL NEGATIV: respingerea explicita a tokenului (4xx) ramane 401, nu devine 503', async () => {
    await expect(rezolvaIdentitate({
      token: 'jwt',
      supabase: supabaseCon(getUserEroare({ status: 401, message: 'invalid' })),
      supabaseAdmin: {},
      clerkSecretKey: 'x',
    })).rejects.toMatchObject({ status: 401 });
  });

  it('fara token -> TOKEN_LIPSA 401', async () => {
    await expect(rezolvaIdentitate({
      token: '',
      supabase: supabaseCon(getUserSucces()),
      supabaseAdmin: {},
    })).rejects.toMatchObject({ cod: 'TOKEN_LIPSA', status: 401 });
  });

  it('EroareIdentitate este un Error cu campurile contract', () => {
    const eroare = new EroareIdentitate('mesaj', 'COD', 409);
    expect(eroare).toBeInstanceOf(Error);
    expect(eroare).toMatchObject({ cod: 'COD', status: 409, message: 'mesaj' });
  });
});

describe('citesteExpiraLaMs', () => {
  it('extrage exp din JWT fara sa verifice semnatura', () => {
    const token = `x.${Buffer.from(JSON.stringify({ exp: 2000000000 })).toString('base64url')}.z`;
    expect(citesteExpiraLaMs(token)).toBe(2000000000 * 1000);
  });

  it('intoarce null pentru payload fara exp sau JWT invalid', () => {
    expect(citesteExpiraLaMs('aaa')).toBeNull();
    expect(citesteExpiraLaMs(`x.${Buffer.from(JSON.stringify({})).toString('base64url')}.z`)).toBeNull();
  });
});
