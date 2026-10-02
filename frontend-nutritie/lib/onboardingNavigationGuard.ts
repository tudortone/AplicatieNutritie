export const DURATA_PROTECTIE_NAVIGARE_MS = 700;

let navigareBlocataPanaLa = 0;

export function incepeProtectieNavigare(acum: number = Date.now()): boolean {
  if (acum < navigareBlocataPanaLa) return false;
  navigareBlocataPanaLa = acum + DURATA_PROTECTIE_NAVIGARE_MS;
  return true;
}

export function protectieNavigareRamasa(acum: number = Date.now()): number {
  return Math.max(0, navigareBlocataPanaLa - acum);
}

export function anuleazaProtectieNavigare(): void {
  navigareBlocataPanaLa = 0;
}
