'use strict';

const express = require('express');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_REQUEST_BYTES = 8 * 1024;

function createFeedbackRouter({ requireAuth, feedbackLimiter, contextDate } = {}) {
  if (typeof requireAuth !== 'function' || typeof feedbackLimiter !== 'function' || typeof contextDate !== 'function') {
    throw new TypeError('Feedback route dependencies are required.');
  }

  const router = express.Router();

  router.post('/feedback', requireAuth, feedbackLimiter, async (req, res) => {
    const contentLength = Number(req.get('content-length') || 0);
    const serializedBody = JSON.stringify(req.body ?? null);
    const payloadBytes = Buffer.byteLength(serializedBody || '', 'utf8');
    if ((Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) || payloadBytes > MAX_REQUEST_BYTES) {
      return res.status(413).json({ eroare: 'Cererea de feedback este prea mare.', cod: 'FEEDBACK_TOO_LARGE' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'message')
      || typeof body.message !== 'string') {
      return res.status(400).json({ eroare: 'Mesajul de feedback este invalid.', cod: 'FEEDBACK_INVALID' });
    }

    const message = body.message.trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ eroare: 'Mesajul trebuie să conțină între 1 și 2000 de caractere.', cod: 'FEEDBACK_INVALID' });
    }

    const userId = typeof req.user?.id === 'string' ? req.user.id : '';
    if (!userId) {
      return res.status(401).json({ eroare: 'Acces neautorizat.', cod: 'UNAUTHORIZED' });
    }

    try {
      const userDataContext = contextDate(req);
      const { data, error } = await userDataContext.db.rpc('submit_user_feedback', { p_message: message });
      const row = Array.isArray(data) ? data[0] : data;

      if (error || !row?.id || !row?.created_at) {
        return res.status(503).json({ eroare: 'Feedback-ul nu a putut fi salvat.', cod: 'FEEDBACK_SAVE_FAILED' });
      }

      return res.status(201).json({
        id: row.id,
        createdAt: row.created_at,
        deliveryStatus: row.delivery_status || 'not_configured',
      });
    } catch {
      // Mesajul și detaliile Supabase nu se trimit în loguri sau în răspuns.
      return res.status(503).json({ eroare: 'Feedback-ul nu a putut fi salvat.', cod: 'FEEDBACK_SAVE_FAILED' });
    }
  });

  return router;
}

module.exports = createFeedbackRouter;
