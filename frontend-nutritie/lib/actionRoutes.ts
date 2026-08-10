/**
 * actionRoutes.ts — Allowlist-ul rutelor interne pe care o notificare le poate
 * deschide. BUG-038: actionRoute vine din storage (persistat) și, teoretic, din
 * payload-uri viitoare; fără allowlist, un șir invalid/învechit ar fi pasat
 * direct la router.push și ar ateriza în +not-found sau ar arunca la navigare.
 */

const STATIC_ROUTES = new Set([
  '/(tabs)',
  '/(tabs)/antrenamente',
  '/(tabs)/chat',
  '/(tabs)/istoric',
  '/(tabs)/profil',
  '/(tabs)/statistici',
  '/calculator-ai',
  '/camera',
  '/jurnal-antrenamente',
  '/legal',
  '/notificari',
  '/paywall',
  '/progres-antrenamente',
  '/scanner-barcode',
]);

// Rute dinamice (ex. /exercitiu/<id>): se acceptă prefixul cunoscut DOAR cu un
// id ne-gol după el, ca un șir minim tip "/exercitiu/" să nu fie navigabil.
const DYNAMIC_PREFIXES = ['/exercitiu/'];

export function isValidActionRoute(route: string): boolean {
  if (typeof route !== 'string') return false;
  if (route.includes('://')) return false; // nicio rută externă (URL/DeepLink)
  return (
    STATIC_ROUTES.has(route) ||
    DYNAMIC_PREFIXES.some((prefix) => route.startsWith(prefix) && route.length > prefix.length)
  );
}