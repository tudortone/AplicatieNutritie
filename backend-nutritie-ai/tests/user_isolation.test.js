const request = require('supertest');
const app = require('../server');

// Mock pentru Supabase Client cu 2 utilizatori distincti (User A si User B)
const USER_A_ID = '11111111-1111-4111-8111-111111111111';
const USER_B_ID = '22222222-2222-4222-8222-222222222222';

jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({
      auth: {
        getUser: jest.fn((token) => {
          if (token === 'token_user_a') {
            return Promise.resolve({ data: { user: { id: USER_A_ID, email: 'usera@example.com' } }, error: null });
          }
          if (token === 'token_user_b') {
            return Promise.resolve({ data: { user: { id: USER_B_ID, email: 'userb@example.com' } }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Token invalid') });
        })
      },
      from: jest.fn((table) => {
        if (table === 'mese') {
          return {
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn(function(col, val) {
              this[col] = val;
              return this;
            }),
            select: jest.fn(function() {
              // Verificare izolare pe user_id si id de masa
              if (this.id === '33333333-3333-4333-8333-333333333333' && this.user_id === USER_B_ID) {
                // Masa apartine lui User B. Daca e interogata cu user_id = USER_A_ID, returneaza gol.
                return Promise.resolve({ data: [{ id: '33333333-3333-4333-8333-333333333333' }], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            })
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis()
        };
      })
    }))
  };
});

describe('VALUL 0 — Test de Integrare Izolare Utilizatori (User Isolation)', () => {
  const MASA_USER_B_ID = '33333333-3333-4333-8333-333333333333';

  it('1. User A încearcă să ștergă masa lui User B → Trebuie să eșueze (404/401)', async () => {
    const res = await request(app)
      .delete(`/api/mese/${MASA_USER_B_ID}`)
      .set('Authorization', 'Bearer token_user_a');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.eroare).toContain('Masa nu a fost găsită');
  });

  it('2. User A încearcă să editeze masa lui User B → Trebuie să eșueze (404/401)', async () => {
    const res = await request(app)
      .put(`/api/mese/${MASA_USER_B_ID}`)
      .set('Authorization', 'Bearer token_user_a')
      .send({ nume: 'Modificare neautorizata' });
    
    // Deoarece PUT nu este expus sau este protejat per-user, res.statusCode este 400 sau 404
    expect([400, 404, 401, 403]).toContain(res.statusCode);
  });

  it('3. User A încearcă să citească masa lui User B → Trebuie să eșueze (404/401)', async () => {
    const res = await request(app)
      .get(`/api/mese/${MASA_USER_B_ID}`)
      .set('Authorization', 'Bearer token_user_a');
    
    expect([404, 401, 403]).toContain(res.statusCode);
  });

  it('4. Cerere fără token de autorizare → Trebuie să eșueze cu 401', async () => {
    const res = await request(app)
      .delete(`/api/mese/${MASA_USER_B_ID}`);
    
    expect(res.statusCode).toBe(401);
    expect(res.body.eroare).toContain('Token lipsă');
  });
});
