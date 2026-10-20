'use strict';

const express = require('express');
const request = require('supertest');
const { creeazaServiciuChatQuota } = require('../utils/chatQuota');
const { ContorLocalCuTtl, creeazaContorPartajat } = require('../utils/contorPartajat');

describe('AI Chat Quota & Cost Protection (Phase 6)', () => {
  let app;
  let contor;
  let chatQuotaService;
  let mockBillingService;

  beforeEach(() => {
    contor = new ContorLocalCuTtl({ plafon: 100 });
    mockBillingService = {
      getPaidEntitlement: jest.fn().mockResolvedValue({ premium: false }),
    };

    chatQuotaService = creeazaServiciuChatQuota({
      contor,
      billingService: mockBillingService,
      limitaFree: 3, // Set low for test efficiency
      limitaPremium: 10,
      limitaTester: 20,
      fereastraMs: 60 * 1000,
    });

    app = express();
    app.use(express.json());

    // Middleware mockAuth
    app.use((req, res, next) => {
      const auth = req.headers.authorization;
      if (!auth) return res.status(401).json({ eroare: 'Token lipsa' });
      if (auth === 'Bearer admin_token') {
        req.user = { id: 'admin-1', esteAdmin: true };
      } else if (auth === 'Bearer tester_token') {
        req.user = { id: 'tester-1', esteTester: true };
      } else if (auth === 'Bearer premium_token') {
        req.user = { id: 'premium-user-1' };
      } else {
        req.user = { id: 'free-user-1' };
      }
      next();
    });

    app.get('/api/chat/quota', async (req, res) => {
      const cota = await chatQuotaService.obtineCota(req.user);
      res.json(cota);
    });

    app.post('/api/chat', chatQuotaService.middlewareCotaChat, (req, res) => {
      if (req.body.simuleazaEroare500) {
        return res.status(500).json({ eroare: 'Eroare provider AI' });
      }
      res.json({ raspuns: 'Salut! Cu ce te pot ajuta astăzi?' });
    });
  });

  it('fails closed when the shared quota counter is unavailable', async () => {
    const counter = creeazaContorPartajat({ fallbackLocal: false });
    const service = creeazaServiciuChatQuota({ contor: counter, billingService: mockBillingService });
    const req = { user: { id: 'quota-store-unavailable-user' } };
    const res = {
      status: jest.fn(function status(code) { this.statusCode = code; return this; }),
      json: jest.fn(function json(body) { this.body = body; return this; }),
    };
    const next = jest.fn();

    await expect(service.obtineCota(req.user)).rejects.toMatchObject({
      code: 'CHAT_QUOTA_STORE_UNAVAILABLE',
    });
    await service.middlewareCotaChat(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.body.cod).toBe('CHAT_QUOTA_STORE_UNAVAILABLE');
    expect(next).not.toHaveBeenCalled();
  });

  describe('1. Free User Quota Enforcement', () => {
    it('permite mesaje până la limita gratuită și include headerele X-AI-Chat-Quota', async () => {
      const res1 = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Mesaj 1' });

      expect(res1.status).toBe(200);
      expect(res1.headers['x-ai-chat-quota-tier']).toBe('free');
      expect(res1.headers['x-ai-chat-quota-total']).toBe('3');
      expect(res1.headers['x-ai-chat-quota-remaining']).toBe('2');

      const res2 = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Mesaj 2' });

      expect(res2.status).toBe(200);
      expect(res2.headers['x-ai-chat-quota-remaining']).toBe('1');

      const res3 = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Mesaj 3' });

      expect(res3.status).toBe(200);
      expect(res3.headers['x-ai-chat-quota-remaining']).toBe('0');
    });

    it('blochează cererea cu 429 CHAT_QUOTA_EXCEEDED la depășirea limitei și nu umflă contorul', async () => {
      // Consumăm primele 3 mesaje
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/chat')
          .set('Authorization', 'Bearer free_token')
          .send({ mesaj: `Mesaj ${i}` });
      }

      // Al 4-lea mesaj este respins
      const res4 = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Mesaj peste limită' });

      expect(res4.status).toBe(429);
      expect(res4.body.cod).toBe('CHAT_QUOTA_EXCEEDED');
      expect(res4.body.total).toBe(3);
      expect(res4.body.ramase).toBe(0);
      expect(res4.body.raspuns).toContain('Ai atins limita zilnică de 3 mesaje');

      // Verificăm că al 5-lea apel primește același 429 fără să crească contorul
      const res5 = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Mesaj peste limită 2' });

      expect(res5.status).toBe(429);
    });
  });

  describe('2. Atomic Rollback on Failure', () => {
    it('restituie unitatea de cotă dacă providerul răspunde cu 500', async () => {
      // 1. Trimitem un mesaj reușit (consumat: 1, rămas: 2)
      await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Succes 1' });

      // 2. Trimitem un mesaj care eșuează cu 500
      const resErr = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer free_token')
        .send({ mesaj: 'Fail', simuleazaEroare500: true });

      expect(resErr.status).toBe(500);

      // Așteptăm ciclul de evenimente pentru finalizarea listener-ului res.on('finish')
      await new Promise((r) => setImmediate(r));

      // 3. Verificăm cota: trebuie să aibă în continuare 2 mesaje rămase (1 consumat din 3)
      const resQuota = await request(app)
        .get('/api/chat/quota')
        .set('Authorization', 'Bearer free_token');

      expect(resQuota.status).toBe(200);
      expect(resQuota.body.consumate).toBe(1);
      expect(resQuota.body.ramase).toBe(2);
    });
  });

  describe('3. Premium and Admin Tiers', () => {
    it('utilizatorul Premium beneficiază de limita extinsă (10)', async () => {
      mockBillingService.getPaidEntitlement.mockResolvedValueOnce({ premium: true });

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer premium_token')
        .send({ mesaj: 'Mesaj Premium' });

      expect(res.status).toBe(200);
      expect(res.headers['x-ai-chat-quota-tier']).toBe('premium');
      expect(res.headers['x-ai-chat-quota-total']).toBe('10');
      expect(res.headers['x-ai-chat-quota-remaining']).toBe('9');
    });

    it('utilizatorul Admin are acces nelimitat fără debitare de contor', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer admin_token')
        .send({ mesaj: 'Mesaj Admin' });

      expect(res.status).toBe(200);
      expect(res.headers['x-ai-chat-quota-tier']).toBe('admin');
      expect(res.headers['x-ai-chat-quota-remaining']).toBe('999999');
    });
  });

  describe('4. GET /api/chat/quota Endpoint', () => {
    it('returnează corect starea server-authoritative a cotei', async () => {
      const res = await request(app)
        .get('/api/chat/quota')
        .set('Authorization', 'Bearer free_token');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.tier).toBe('free');
      expect(typeof res.body.ramase).toBe('number');
      expect(res.body.reseteazaLa).toBeDefined();
    });

    it('este strict read-only: nu apelează increment/decrement și nu creează intrări fantomă în contor', async () => {
      const incrSpy = jest.spyOn(contor, 'increment');
      const decrSpy = jest.spyOn(contor, 'decrement');

      const res = await request(app)
        .get('/api/chat/quota')
        .set('Authorization', 'Bearer free_token');

      expect(res.status).toBe(200);
      expect(res.body.consumate).toBe(0);
      expect(res.body.ramase).toBe(3);
      expect(incrSpy).not.toHaveBeenCalled();
      expect(decrSpy).not.toHaveBeenCalled();
      expect(contor.intrari.size).toBe(0);
    });

    it('nu provoacă un fals 429 la limita - 1 când GET /chat/quota rulează concurent cu POST /chat', async () => {
      let valoare = 2; // 2 din 3 consumate (1 mesaj rămas)
      const contorAsincron = {
        get: jest.fn(async () => valoare),
        ttl: jest.fn(async () => 3600),
        increment: jest.fn(async () => {
          valoare += 1;
          const curent = valoare;
          // Fereastra de rețea Redis între INCR și eventualul DECR
          await new Promise((r) => setTimeout(r, 25));
          return curent;
        }),
        decrement: jest.fn(async () => {
          valoare = Math.max(0, valoare - 1);
          return valoare;
        }),
      };

      const serviciuConcurent = creeazaServiciuChatQuota({
        contor: contorAsincron,
        billingService: mockBillingService,
        limitaFree: 3,
      });

      const appConcurent = express();
      appConcurent.use(express.json());
      appConcurent.use((req, _res, next) => {
        req.user = { id: 'free-race-user' };
        next();
      });
      appConcurent.get('/api/chat/quota', async (req, res) => {
        res.json(await serviciuConcurent.obtineCota(req.user));
      });
      appConcurent.post('/api/chat', serviciuConcurent.middlewareCotaChat, (_req, res) => {
        res.json({ raspuns: 'Ultimul mesaj permis!' });
      });

      const [quotaRes, chatRes] = await Promise.all([
        request(appConcurent).get('/api/chat/quota'),
        request(appConcurent).post('/api/chat').send({ mesaj: 'Al 3-lea mesaj' }),
      ]);

      expect(quotaRes.status).toBe(200);
      expect(chatRes.status).toBe(200);
      expect(valoare).toBe(3);
    });
  });
});
