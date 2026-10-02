'use strict';

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

class GooglePubsubAuthError extends Error {
  constructor(code, status) {
    super('Google Pub/Sub push authentication failed.');
    this.name = 'GooglePubsubAuthError';
    this.code = code;
    this.status = status;
  }
}

function defaultOauthClient() {
  // Incarcare lenesa: testele pot injecta complet limita criptografica.
  const { OAuth2Client } = require('google-auth-library');
  return new OAuth2Client();
}

function createGooglePubsubVerifier({ audience, serviceAccountEmail, client } = {}) {
  if (typeof audience !== 'string' || typeof serviceAccountEmail !== 'string') {
    throw new TypeError('Google Pub/Sub audience and service account are required.');
  }
  const oauthClient = client ?? defaultOauthClient();

  return Object.freeze({
    async verifyRequest(req) {
      const authorization = req?.headers?.authorization;
      const match = typeof authorization === 'string'
        ? authorization.match(/^Bearer ([^\s]+)$/)
        : null;
      if (!match) throw new GooglePubsubAuthError('PUBSUB_TOKEN_MISSING', 401);

      let payload;
      try {
        const ticket = await oauthClient.verifyIdToken({
          idToken: match[1],
          audience,
        });
        payload = ticket.getPayload();
      } catch {
        throw new GooglePubsubAuthError('PUBSUB_TOKEN_INVALID', 401);
      }

      if (!payload || payload.aud !== audience || !GOOGLE_ISSUERS.has(payload.iss)) {
        throw new GooglePubsubAuthError('PUBSUB_CLAIMS_INVALID', 403);
      }
      if (payload.email !== serviceAccountEmail || payload.email_verified !== true) {
        throw new GooglePubsubAuthError('PUBSUB_SERVICE_ACCOUNT_FORBIDDEN', 403);
      }
      return Object.freeze({ email: payload.email, subject: payload.sub ?? null });
    },
  });
}

module.exports = {
  GooglePubsubAuthError,
  createGooglePubsubVerifier,
};
