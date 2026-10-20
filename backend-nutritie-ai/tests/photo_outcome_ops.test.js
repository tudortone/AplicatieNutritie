'use strict';

const express = require('express');
const request = require('supertest');
const createPhotoOutcomeOpsRouter = require('../routes/photoOutcomeOps');

const USER = '11111111-1111-4111-8111-111111111111';
const RESERVATION = '22222222-2222-4222-8222-222222222222';

function build({ admin = false } = {}) {
  const flowCredits = {
    listPhotoOutcomeReconciliationQueue: jest.fn(async () => [{ reservation_id: RESERVATION }]),
    resolvePhotoOutcomeUnknown: jest.fn(async () => ({ ok: true, status: 'RELEASED', replay: false })),
  };
  const requireAuth = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).end();
    req.user = { id: USER, esteAdmin: admin };
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createPhotoOutcomeOpsRouter({
    requireAuth, generalLimiter: (_req, _res, next) => next(), flowCredits,
  }));
  return { app, flowCredits };
}

describe('Photo outcome operator recovery routes', () => {
  test('requires authenticated server-admin metadata to list the reconciliation queue', async () => {
    const { app, flowCredits } = build();
    await request(app).get('/api/v1/admin/photo-outcomes/unknown').expect(401);
    await request(app).get('/api/v1/admin/photo-outcomes/unknown').set('Authorization', 'Bearer user').expect(403);
    expect(flowCredits.listPhotoOutcomeReconciliationQueue).not.toHaveBeenCalled();
  });

  test('returns the bounded queue without enabling client access', async () => {
    const { app, flowCredits } = build({ admin: true });
    const response = await request(app).get('/api/v1/admin/photo-outcomes/unknown')
      .set('Authorization', 'Bearer admin').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.outcomes).toEqual([{ reservation_id: RESERVATION }]);
    expect(flowCredits.listPhotoOutcomeReconciliationQueue).toHaveBeenCalledWith({ limit: 50 });
  });

  test('requires explicit confirmed failure and an evidence reference before release', async () => {
    const { app, flowCredits } = build({ admin: true });
    await request(app).post(`/api/v1/admin/photo-outcomes/${USER}/${RESERVATION}/confirm-failure`)
      .set('Authorization', 'Bearer admin').send({ confirmedFailure: false, evidenceReference: 'trigger-run-1' }).expect(400);
    expect(flowCredits.resolvePhotoOutcomeUnknown).not.toHaveBeenCalled();
    await request(app).post(`/api/v1/admin/photo-outcomes/${USER}/${RESERVATION}/confirm-failure`)
      .set('Authorization', 'Bearer admin').send({ confirmedFailure: true, evidenceReference: 'trigger-run-1' })
      .expect(200, { status: 'RELEASED', replay: false });
    expect(flowCredits.resolvePhotoOutcomeUnknown).toHaveBeenCalledWith({
      userId: USER, reservationId: RESERVATION, evidenceReference: 'trigger-run-1', operatorId: USER,
    });
  });

  test('returns conflict when the durable reservation is no longer eligible for resolution', async () => {
    const { app, flowCredits } = build({ admin: true });
    flowCredits.resolvePhotoOutcomeUnknown.mockRejectedValue(
      Object.assign(new Error('already reconciled'), { status: 409, code: 'PHOTO_OUTCOME_NOT_RESOLVABLE' }),
    );
    await request(app).post(`/api/v1/admin/photo-outcomes/${USER}/${RESERVATION}/confirm-failure`)
      .set('Authorization', 'Bearer admin').send({ confirmedFailure: true, evidenceReference: 'trigger-run-1' })
      .expect(409, { eroare: 'Rezultatul nu poate fi reconciliat.', cod: 'PHOTO_OUTCOME_NOT_RESOLVABLE' });
  });
});
