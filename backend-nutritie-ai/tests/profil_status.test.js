'use strict';

const express = require('express');
const request = require('supertest');

const createUserRouter = require('../routes/user');

/**
 * GET /api/user/profil — verificarea server-side a completitudinii profilului.
 * Folosit de gardul de navigare din aplicatie: un utilizator autentificat fara
 * profil complet este trimis inapoi la onboarding.
 */
function facAplicatie({ profil = null, contextDateEroare = false } = {}) {
  const app = express();
  const router = createUserRouter({
    requireAuth: (req, _res, next) => {
      req.user = { id: '11111111-1111-4111-8111-111111111111', esteAdmin: false };
      next();
    },
    generalLimiter: (_req, _res, next) => next(),
    config: {},
    contextDate: (_req, _res) => {
      if (contextDateEroare) throw new Error('client RLS indisponibil');
      return { userId: '11111111-1111-4111-8111-111111111111' };
    },
    profilRepo: {
      getProfil: async () => profil,
    },
  });
  app.use('/api/user', router);
  return app;
}

describe('GET /profil — gardul server-side al completitudinii profilului', () => {
  it('returneaza exista:false, complet:false cand nu exista rand de profil', async () => {
    const res = await request(facAplicatie({ profil: null })).get('/api/user/profil');
    expect(res.statusCode).toBe(200);
    expect(res.body.exista).toBe(false);
    expect(res.body.complet).toBe(false);
    expect(res.body.profil).toBeNull();
  });

  it('returneaza exista:true, complet:true pentru un profil complet', async () => {
    const res = await request(facAplicatie({
      profil: {
        user_id: '11111111-1111-4111-8111-111111111111',
        varsta: 30,
        greutate: 80,
        inaltime: 180,
        sex: 'masculin',
        activitate: 'moderat',
        obiectiv: 'mentinere',
        calorii_tinta: 2400,
        proteine_tinta: 160,
        grasimi_tinta: 70,
        carbi_tinta: 250,
      },
    })).get('/api/user/profil');
    expect(res.statusCode).toBe(200);
    expect(res.body.exista).toBe(true);
    expect(res.body.complet).toBe(true);
    expect(res.body.profil.caloriiTinta).toBe(2400);
    expect(res.body.profil.greutate).toBe(80);
  });

  it('returneaza exista:true, complet:false pentru un profil partial (doar default-urile webhook-ului Clerk)', async () => {
    const res = await request(facAplicatie({
      profil: { user_id: '11111111-1111-4111-8111-111111111111', calorii_tinta: 2000 },
    })).get('/api/user/profil');
    expect(res.statusCode).toBe(200);
    expect(res.body.exista).toBe(true);
    expect(res.body.complet).toBe(false);
  });

  it('returneaza 503 la eroare de citire (fail-closed: nu minte despre completitudine)', async () => {
    const res = await request(facAplicatie({ contextDateEroare: true })).get('/api/user/profil');
    expect(res.statusCode).toBe(503);
    expect(res.body.complet).not.toBe(true);
  });

  it('cere autentificare (requireAuth inainte de citire)', async () => {
    const app = express();
    const router = createUserRouter({
      requireAuth: (_req, res) => res.status(401).json({ eroare: 'Neautorizat.' }),
      generalLimiter: (_req, _res, next) => next(),
      config: {},
      contextDate: () => ({}),
      profilRepo: { getProfil: async () => null },
    });
    app.use('/api/user', router);
    const res = await request(app).get('/api/user/profil');
    expect(res.statusCode).toBe(401);
  });
});
