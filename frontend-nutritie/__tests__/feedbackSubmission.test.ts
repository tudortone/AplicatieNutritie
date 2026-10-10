import { sanitizeFeedback, submitFeedback } from '../lib/feedback';

describe('durable feedback submission contract', () => {
  test('trims and redacts sensitive patterns before sending', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'id-1', createdAt: '2026-10-09T12:00:00Z', deliveryStatus: 'not_configured' }),
    } as Response));

    await submitFeedback('  Issue from user@example.com  ', 'access-token', fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/feedback$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
        body: JSON.stringify({ message: 'Issue from [EMAIL_REDACTED]' }),
      }),
    );
  });

  test('validates message and authentication before making a request', async () => {
    const fetcher = jest.fn();
    await expect(submitFeedback('  ', 'token', fetcher)).rejects.toThrow('FEEDBACK_INVALID');
    await expect(submitFeedback('message', undefined, fetcher)).rejects.toThrow('FEEDBACK_AUTH_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('does not treat backend failure or an invalid receipt as success', async () => {
    const failed = jest.fn(async () => ({ ok: false, json: async () => ({}) } as Response));
    await expect(submitFeedback('message', 'token', failed)).rejects.toThrow('FEEDBACK_SAVE_FAILED');

    const noReceipt = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
    await expect(submitFeedback('message', 'token', noReceipt)).rejects.toThrow('FEEDBACK_SAVE_FAILED');
  });

  test('caps final sanitized payload length at the backend limit', () => {
    expect(sanitizeFeedback('x'.repeat(2100))).toHaveLength(2000);
    expect(sanitizeFeedback('contact user@example.com')).toContain('[EMAIL_REDACTED]');
  });
});
