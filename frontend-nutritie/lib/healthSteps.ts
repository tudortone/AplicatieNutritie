// Helpers pure pentru contorizarea pașilor — fără dependențe native, ca să poată
// fi testate în jest. Logica de fuziune/persistare trăiește ici, iar useHealthSync
// doar orchestrează sursele (senzor, stocare, adăugare manuală).

// Cheia zilei LOCALĂ (nu UTC): se aliniază la fereastra „de la miezul nopții local"
// folosită de getStepCountAsync pe iOS și de persistarea totalului zilnic.
export function ziLocalDeAzi(acum: Date = new Date()): string {
  const an = acum.getFullYear();
  const luna = String(acum.getMonth() + 1).padStart(2, '0');
  const ziua = String(acum.getDate()).padStart(2, '0');
  return `${an}-${luna}-${ziua}`;
}

export interface MergePașiParams {
  storedTotal: number;
  manualSteps: number;
  sensorSteps: number;
  citireSenzorOk: boolean;
}

// Pe Android `getStepCountAsync` aruncă NotSupportedException (nu există „pași de
// la miezul nopții"), deci singura sursă solidă e totalul PERSISTAT al zilei +
// pașii manuali. Pe iOS citirea senzorului e autoritativă și include toată ziua.
export function mergePașiTotal({ storedTotal, manualSteps, sensorSteps, citireSenzorOk }: MergePașiParams): number {
  if (citireSenzorOk) {
    return sensorSteps + manualSteps;
  }
  // storedTotal conține deja pașii manuali persistați; max() se apără de dubla
  // numărare când încă nu există niciun total persistat pentru ziua asta.
  return Math.max(storedTotal, manualSteps);
}

export function adaugaPașiManual(actual: number, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return actual;
  return actual + Math.round(amount);
}