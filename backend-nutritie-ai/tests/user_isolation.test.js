const request = require('supertest');

const mockUserAId = '11111111-1111-4111-8111-111111111111';
const mockUserBId = '22222222-2222-4222-8222-222222222222';
const mockMasaUserBId = '33333333-3333-4333-8333-333333333333';

jest.mock('@supabase/supabase-js', () => {
  const uA = '11111111-1111-4111-8111-111111111111';
  const uB = '22222222-2222-4222-8222-222222222222';
  const mB = '33333333-3333-4333-8333-333333333333';

  // E-2: seed-ul tabelului mock. `db` se cloneaza din el la fiecare reset, ca
  // beforeEach din fisierul de test sa refaca exact starea initiala — suita nu
  // depinde de ordinea de executie (--runInBand sau fara).
  const seedDb = [
    { id: '10000000-0000-4000-8000-000000000000', user_id: uA, nume: 'Masa A' },
    { id: mB, user_id: uB, nume: 'Masa B' }
  ];

  // `let`, nu `const`: delete()/update() din mock trebuie sa modifice tabelul
  // ca sa existe si control pozitiv, nu doar eforturi esuate.
  let db = seedDb.map((m) => ({ ...m }));

  return {
    // E-2: expus pentru beforeEach din tests/user_isolation.test.js.
    __resetDbMock: () => { db = seedDb.map((m) => ({ ...m })); },
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn((token) => {
          if (token === 'token_user_a') {
            return Promise.resolve({ data: { user: { id: uA, email: 'usera@example.com' } }, error: null });
          }
          if (token === 'token_user_b') {
            return Promise.resolve({ data: { user: { id: uB, email: 'userb@example.com' } }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Token invalid') });
        })
      },
      from: jest.fn((table) => {
        if (table === 'mese') {
          let queryFilter = {};
          // Marginal: delete()/update() marcheaza operatia; mutatia reala se face
          // LA MOMENTUL select(), cand filtrele `.eq()` au fost deja populate.
          // Daca l-am face la delete()/update(), filtrele inca lipsesc si am sterge
          // sau edita tot tabelul. Asa reproduce comportamentul Supabase: filtrul
          // face parte din aceeasi interogare ca mutatia.
          let operatie = null;        // 'delete' | 'update' | null
          let payloadOperatie = null;

          const filtreaza = () => db.filter(m => {
            let match = true;
            if (queryFilter.id && m.id !== queryFilter.id) match = false;
            if (queryFilter.user_id && m.user_id !== queryFilter.user_id) match = false;
            return match;
          });

          const builder = {
            eq: jest.fn((col, val) => {
              queryFilter[col] = val;
              return builder;
            }),
            select: jest.fn(() => {
              if (operatie) {
                const potrivite = filtreaza();
                let rezultat;
                if (operatie === 'delete') {
                  rezultat = potrivite;
                  db = db.filter(m => !potrivite.includes(m));
                } else {
                  rezultat = potrivite.map(m => ({ ...m, ...payloadOperatie }));
                  db = db.map(m => potrivite.includes(m) ? { ...m, ...payloadOperatie } : m);
                }
                operatie = null;
                payloadOperatie = null;
                queryFilter = {};
                return Promise.resolve({ data: rezultat, error: null });
              }
              return Promise.resolve({ data: filtreaza(), error: null });
            }),
            delete: jest.fn(() => {
              operatie = 'delete';
              return builder;
            }),
            update: jest.fn((payload) => {
              operatie = 'update';
              payloadOperatie = payload;
              return builder;
            })
          };
          return builder;
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null })
        };
      })
    }))
  };
});

const app = require('../server');

// E-2: reset expus de mock — reface tabelul la starea inițială (seed) între teste.
const { __resetDbMock } = require('@supabase/supabase-js');

describe('VALUL 0 — Test de Integrare Izolare Utilizatori (User Isolation)', () => {
  // E-2: fără reset, testele 4-5 mută `db`-ul mock partajat, iar suita ar depinde
  // de ordinea de execuție (--runInBand sau paralel). Resetul face fiecare test
  // independent: se pornește mereu de la cele două mese de seed.
  beforeEach(() => {
    __resetDbMock();
  });

  it('1. User A încearcă să ștergă masa lui User B → Trebuie să primească strict 404 (Masa nu a fost găsită)', async () => {
    const res = await request(app)
      .delete(`/api/mese/${mockMasaUserBId}`)
      .set('Authorization', 'Bearer token_user_a');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.eroare).toBe('Masa nu a fost găsită.');
  });

  it('2. User A încearcă să editeze masa lui User B cu PUT /api/mese/:id → Trebuie să primească strict 404', async () => {
    const res = await request(app)
      .put(`/api/mese/${mockMasaUserBId}`)
      .set('Authorization', 'Bearer token_user_a')
      .send({
        nume: 'Atac Modificare Masi',
        calorii: 500,
        proteine: 30,
        grasimi: 10,
        carbohidrati: 50,
        fibre: 5
      });
    
    expect(res.statusCode).toBe(404);
    expect(res.body.eroare).toBe('Masa nu a fost găsită.');
  });

  it('3. Cerere fără token de autorizare → Trebuie să fie respinsă cu 401', async () => {
    const res = await request(app)
      .delete(`/api/mese/${mockMasaUserBId}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.eroare).toContain('Token lipsă');
  });

  // 4 & 5 — CONTROL POZITIV (B-04). Cele 3 de mai sus prind doar esecuri; fara
  // acestea, un server care raspunde 404 la orice ar trece toata suita. Aici A
  // trebuie sa REUSESTA pe propria masa, ca suita sa nu fie orbit de eforturi
  // esuate. Negativele probeaza izolarea; aici randul exista, apartine lui A si
  // inlaturarea filtrului de user pe handler ar fi vizibila imediat.
  it('4. User A editează CU SUCCES propria masă (10000000-...) → 200', async () => {
    const res = await request(app)
      .put(`/api/mese/10000000-0000-4000-8000-000000000000`)
      .set('Authorization', 'Bearer token_user_a')
      .send({
        nume: 'Masa A editata',
        calorii: 500,
        proteine: 30,
        grasimi: 10,
        carbohidrati: 50,
        fibre: 5
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
    expect(res.body.masa).toBeDefined();
    expect(res.body.masa.nume).toBe('Masa A editata');
  });

  it('5. User A șterge CU SUCCES propria masă (10000000-...) → 200', async () => {
    const res = await request(app)
      .delete(`/api/mese/10000000-0000-4000-8000-000000000000`)
      .set('Authorization', 'Bearer token_user_a');

    expect(res.statusCode).toBe(200);
    expect(res.body.succes).toBe(true);
  });
});
