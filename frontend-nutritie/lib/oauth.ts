// PKCE: Supabase intoarce `code` in query-string-ul URL-ului de redirect dupa ce
// utilizatorul se autentifica la provider. Se extrage manual (fara dependenta de
// URLSearchParams global) ca schimbul sa se faca in proces, pe fluxul PKCE.
export const extrageCodDinUrl = (url: string): string | null => {
  const indexSemnal = url.indexOf('?');
  if (indexSemnal === -1) return null;
  const query = url.slice(indexSemnal + 1);
  for (const pereche of query.split('&')) {
    const [cheie, valoare] = pereche.split('=');
    if (cheie === 'code' && valoare) return decodeURIComponent(valoare);
  }
  return null;
};
