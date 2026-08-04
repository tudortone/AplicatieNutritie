const request = require('supertest');

const mockUserAId = '11111111-1111-4111-8111-111111111111';
const mockUserBId = '22222222-2222-4222-8222-222222222222';
const mockMasaUserBId = '33333333-3333-4333-8333-333333333333';

jest.mock('@supabase/supabase-js', () => {
  const uA = '11111111-1111-4111-8111-111111111111';
  const uB = '22222222-2222-4222-8222-222222222222';
  const mB = '33333333-3333-4333-8333-333333333333';

  const db = [
    { id: '10000000-0000-4000-8000-000000000000', user_id: uA, nume: 'Masa A' },
    { id: mB, user_id: uB, nume: 'Masa B' }
  ];

  return {
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
          
          const builder = {
            eq: jest.fn((col, val) => {
              queryFilter[col] = val;
              return builder;
            }),
            select: jest.fn(() => {
              const matched = db.filter(m => {
                let match = true;
                if (queryFilter.id && m.id !== queryFilter.id) match = false;
                if (queryFilter.user_id && m.user_id !== queryFilter.user_id) match = false;
                return match;
              });
              return Promise.resolve({ data: matched, error: null });
            }),
            delete: jest.fn(() => {
              const matched = db.filter(m => {
                let match = true;
                if (queryFilter.id && m.id !== queryFilter.id) match = false;
                if (queryFilter.user_id && m.user_id !== queryFilter.user_id) match = false;
                return match;
              });
              return builder;
            }),
            update: jest.fn(() => {
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

describe('VALUL 0 — Test de Integrare Izolare Utilizatori (User Isolation)', () => {
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
});
