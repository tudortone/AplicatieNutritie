import { buildApiUrl } from './api';

export const MAX_FEEDBACK_LENGTH = 2000;

export function sanitizeFeedback(value: string): string {
  return value
    .trim()
    .slice(0, MAX_FEEDBACK_LENGTH)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[PHONE_REDACTED]')
    .slice(0, MAX_FEEDBACK_LENGTH);
}

export interface FeedbackReceipt {
  id: string;
  createdAt: string;
  deliveryStatus: 'not_configured' | 'pending' | 'sent' | 'failed';
}

export async function submitFeedback(
  value: string,
  accessToken: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<FeedbackReceipt> {
  const message = sanitizeFeedback(value);
  if (!message) throw new Error('FEEDBACK_INVALID');
  if (!accessToken) throw new Error('FEEDBACK_AUTH_REQUIRED');

  const response = await fetcher(buildApiUrl('/feedback'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) throw new Error('FEEDBACK_SAVE_FAILED');
  const receipt = await response.json() as Partial<FeedbackReceipt>;
  if (typeof receipt.id !== 'string' || typeof receipt.createdAt !== 'string') {
    throw new Error('FEEDBACK_SAVE_FAILED');
  }
  return {
    id: receipt.id,
    createdAt: receipt.createdAt,
    deliveryStatus: receipt.deliveryStatus === 'sent' || receipt.deliveryStatus === 'pending' || receipt.deliveryStatus === 'failed'
      ? receipt.deliveryStatus
      : 'not_configured',
  };
}
