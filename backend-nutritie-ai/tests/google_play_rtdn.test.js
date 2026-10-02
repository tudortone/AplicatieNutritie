'use strict';

const express = require('express');
const request = require('supertest');
const {
  GooglePubsubAuthError,
  createGooglePubsubVerifier,
} = require('../utils/googlePubsubAuth');
const createGooglePlayWebhookRouter = require('../routes/webhooksGooglePlay');
const { createGoogleBillingWorker } = require('../utils/googleBillingWorker');
const { hashPurchaseToken } = require('../services/billing/googleBillingService');
const fs = require('fs');
const path = require('path');

const AUDIENCE = 'https://api.nutriai.ro/api/v1/webhooks/google-play';
const SERVICE_EMAIL = 'play-rtdn@nutriai.iam.gserviceaccount.com';
const PURCHASE_TOKEN = 'google-play-rtdn-token-123456';

function payload(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    email: SERVICE_EMAIL,
    email_verified: true,
    ...overrides,
  };
}

function pubsubEnvelope(inner = {}, messageOverrides = {}) {
  const rtdn = {
    version: '1.0',
    packageName: 'com.totsrl.getflo',
    eventTimeMillis: '1789376400000',
    subscriptionNotification: {
      version: '1.0',
      notificationType: 2,
      purchaseToken: PURCHASE_TOKEN,
      subscriptionId: 'premium_monthly',
    },
    ...inner,
  };
  return {
    message: {
      messageId: 'pubsub-message-1',
      publishTime: '2026-09-14T10:00:01.000Z',
      data: Buffer.from(JSON.stringify(rtdn)).toString('base64'),
      ...messageOverrides,
    },
    subscription: 'projects/getflow/subscriptions/google-play-rtdn',
  };
}

describe('autentificarea OIDC pentru Pub/Sub push', () => {
  test('verifica semnatura, audience, email-ul exact si email_verified', async () => {
    const ticket = { getPayload: jest.fn().mockReturnValue(payload()) };
    const client = { verifyIdToken: jest.fn().mockResolvedValue(ticket) };
    const verifier = createGooglePubsubVerifier({
      audience: AUDIENCE,
      serviceAccountEmail: SERVICE_EMAIL,
      client,
    });
    await expect(verifier.verifyRequest({
      headers: { authorization: 'Bearer signed-google-jwt' },
    })).resolves.toMatchObject({ email: SERVICE_EMAIL });
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'signed-google-jwt',
      audience: AUDIENCE,
    });
  });

  test('respinge lipsa tokenului, semnatura invalida si orice claim nepotrivit', async () => {
    const client = { verifyIdToken: jest.fn() };
    const verifier = createGooglePubsubVerifier({
      audience: AUDIENCE,
      serviceAccountEmail: SERVICE_EMAIL,
      client,
    });
    await expect(verifier.verifyRequest({ headers: {} }))
      .rejects.toMatchObject({ status: 401, code: 'PUBSUB_TOKEN_MISSING' });

    client.verifyIdToken.mockRejectedValueOnce(new Error('raw jwt failure'));
    await expect(verifier.verifyRequest({ headers: { authorization: 'Bearer invalid' } }))
      .rejects.toMatchObject({ status: 401, code: 'PUBSUB_TOKEN_INVALID' });

    for (const badPayload of [
      payload({ aud: 'https://attacker.example' }),
      payload({ email: 'attacker@nutriai.iam.gserviceaccount.com' }),
      payload({ email_verified: false }),
      payload({ iss: 'https://attacker.example' }),
    ]) {
      client.verifyIdToken.mockResolvedValueOnce({ getPayload: () => badPayload });
      await expect(verifier.verifyRequest({ headers: { authorization: 'Bearer signed' } }))
        .rejects.toBeInstanceOf(GooglePubsubAuthError);
    }
  });
});

function routeHarness({ claim = true } = {}) {
  const verifier = { verifyRequest: jest.fn().mockResolvedValue(payload()) };
  const repo = {
    claimRtdnEvent: jest.fn().mockResolvedValue(claim),
    completeRtdnEvent: jest.fn().mockResolvedValue(true),
  };
  const billingService = {
    processRtdnToken: jest.fn().mockResolvedValue({ processed: true, premium: true }),
  };
  const app = express();
  app.use('/api/v1/webhooks/google-play', createGooglePlayWebhookRouter({
    verifier,
    repo,
    billingService,
    googlePlayConfig: { packageName: 'com.totsrl.getflo' },
  }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'safe' }));
  return { app, verifier, repo, billingService };
}

describe('RTDN Google Play autenticat si idempotent', () => {
  test('bootstrap-ul monteaza RTDN inainte de parserul JSON global si porneste workerul', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    const mount = source.indexOf("app.use('/api/v1/webhooks/google-play', webhooksGooglePlayR)");
    const jsonParser = source.indexOf("app.use(express.json({ limit: '1mb' }))");
    expect(mount).toBeGreaterThan(0);
    expect(mount).toBeLessThan(jsonParser);
    expect(source).toContain('createGooglePubsubVerifier({');
    expect(source).toContain('createGoogleBillingWorker({');
  });

  test('autentifica push-ul inainte de parserul JSON', async () => {
    const { app, verifier, repo } = routeHarness();
    verifier.verifyRequest.mockRejectedValue(new GooglePubsubAuthError('PUBSUB_TOKEN_INVALID', 401));
    const response = await request(app)
      .post('/api/v1/webhooks/google-play')
      .set('Content-Type', 'application/json')
      .send('{broken-json');
    expect(response.statusCode).toBe(401);
    expect(repo.claimRtdnEvent).not.toHaveBeenCalled();
  });

  test('deduplica durabil si refoloseste numai tokenul ca trigger de refetch', async () => {
    const { app, repo, billingService } = routeHarness();
    const response = await request(app)
      .post('/api/v1/webhooks/google-play')
      .set('Authorization', 'Bearer signed')
      .send(pubsubEnvelope());
    expect(response.statusCode).toBe(204);
    expect(repo.claimRtdnEvent).toHaveBeenCalledWith({
      messageId: 'pubsub-message-1',
      publishTime: '2026-09-14T10:00:01.000Z',
      eventTime: '2026-09-14T09:00:00.000Z',
      packageName: 'com.totsrl.getflo',
      notificationType: 2,
      purchaseTokenHash: hashPurchaseToken(PURCHASE_TOKEN),
    });
    expect(billingService.processRtdnToken).toHaveBeenCalledWith({
      purchaseToken: PURCHASE_TOKEN,
      messageId: 'pubsub-message-1',
    });
    expect(repo.completeRtdnEvent).toHaveBeenCalledWith({
      messageId: 'pubsub-message-1',
      processingStatus: 'processed',
    });
  });

  test('un mesaj deja revendicat raspunde 2xx fara al doilea apel Google', async () => {
    const { app, billingService, repo } = routeHarness({ claim: false });
    const response = await request(app)
      .post('/api/v1/webhooks/google-play')
      .set('Authorization', 'Bearer signed')
      .send(pubsubEnvelope());
    expect(response.statusCode).toBe(204);
    expect(billingService.processRtdnToken).not.toHaveBeenCalled();
    expect(repo.completeRtdnEvent).not.toHaveBeenCalled();
  });

  test('package strain si test notification necunoscut sunt arhivate sigur cu 2xx', async () => {
    const wrong = routeHarness();
    const wrongResponse = await request(wrong.app)
      .post('/api/v1/webhooks/google-play')
      .set('Authorization', 'Bearer signed')
      .send(pubsubEnvelope({ packageName: 'com.attacker.copy' }));
    expect(wrongResponse.statusCode).toBe(204);
    expect(wrong.billingService.processRtdnToken).not.toHaveBeenCalled();
    expect(wrong.repo.completeRtdnEvent).toHaveBeenCalledWith(expect.objectContaining({
      processingStatus: 'ignored',
      errorCode: 'PACKAGE_MISMATCH',
    }));

    const testEvent = routeHarness();
    const response = await request(testEvent.app)
      .post('/api/v1/webhooks/google-play')
      .set('Authorization', 'Bearer signed')
      .send(pubsubEnvelope({ subscriptionNotification: undefined, testNotification: { version: '1.0' } }));
    expect(response.statusCode).toBe(204);
    expect(testEvent.billingService.processRtdnToken).not.toHaveBeenCalled();
  });

  test('eroarea tranzitorie este marcata retryable si raspunde non-2xx', async () => {
    const { app, billingService, repo } = routeHarness();
    billingService.processRtdnToken.mockRejectedValue(Object.assign(new Error('secret'), {
      code: 'GOOGLE_PLAY_UNAVAILABLE',
      status: 503,
      retryable: true,
    }));
    const response = await request(app)
      .post('/api/v1/webhooks/google-play')
      .set('Authorization', 'Bearer signed')
      .send(pubsubEnvelope());
    expect(response.statusCode).toBe(503);
    expect(repo.completeRtdnEvent).toHaveBeenCalledWith({
      messageId: 'pubsub-message-1',
      processingStatus: 'retryable_error',
      errorCode: 'GOOGLE_PLAY_UNAVAILABLE',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});

describe('workerul de recuperare acknowledgement', () => {
  test('nu suprapune rulari si poate fi oprit curat', async () => {
    let tick;
    const clearIntervalImpl = jest.fn();
    const billingService = {
      retryPendingAcknowledgements: jest.fn().mockResolvedValue({ claimed: 0, succeeded: 0, failed: 0 }),
    };
    const worker = createGoogleBillingWorker({
      billingService,
      setIntervalImpl: (fn) => { tick = fn; return { unref: jest.fn() }; },
      clearIntervalImpl,
    });
    const first = tick();
    const second = tick();
    await Promise.all([first, second]);
    expect(billingService.retryPendingAcknowledgements).toHaveBeenCalledTimes(1);
    worker.stop();
    expect(clearIntervalImpl).toHaveBeenCalledTimes(1);
  });
});
