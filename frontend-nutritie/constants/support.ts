/** Public user-support address, kept consistent with the published legal pages. */
export const SUPPORT_EMAIL = 'supportgetflow@gmail.com';

export function buildSupportMailto(email: string = SUPPORT_EMAIL): string {
  return `mailto:${email}`;
}
