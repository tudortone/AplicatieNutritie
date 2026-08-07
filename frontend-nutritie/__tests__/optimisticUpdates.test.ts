import { Masa } from '../types';

describe('U-09 — UI Optimist pentru ștergerea meselor', () => {
  const meseInitial: Masa[] = [
    {
      id: 'm1',
      user_id: 'user_123',
      nume: 'Omletă cu brânză',
      calorii: 300,
      proteine: 25,
      grasimi: 15,
      carbohidrati: 5,
      fibre: 0,
      tip_masa: 'mic_dejun',
      created_at: '2026-08-07T12:00:00Z',
    },
    {
      id: 'm2',
      user_id: 'user_123',
      nume: 'Salată cu ton',
      calorii: 200,
      proteine: 20,
      grasimi: 8,
      carbohidrati: 10,
      fibre: 0,
      tip_masa: 'pranz',
      created_at: '2026-08-07T12:00:00Z',
    },
  ];

  function executaStergereOptimista(
    prevMese: Masa[],
    id: string,
    stateTotaluri: { calorii: number; proteine: number; grasimi: number; carbohidrati: number; numarMese: number }
  ): { mese: Masa[]; calorii: number; proteine: number; grasimi: number; carbohidrati: number; numarMese: number; masaEliminata?: Masa } {
    const deSters = prevMese.find((m) => m.id === id);
    if (!deSters) return { mese: prevMese, ...stateTotaluri };


    const noiMese = prevMese.filter((m) => m.id !== id);
    const noiTotaluri = {
      calorii: Math.max(0, stateTotaluri.calorii - (deSters.calorii || 0)),
      proteine: Math.max(0, stateTotaluri.proteine - (deSters.proteine || 0)),
      grasimi: Math.max(0, stateTotaluri.grasimi - (deSters.grasimi || 0)),
      carbohidrati: Math.max(0, stateTotaluri.carbohidrati - (deSters.carbohidrati || 0)),
      numarMese: Math.max(0, stateTotaluri.numarMese - 1),
    };

    return { mese: noiMese, ...noiTotaluri, masaEliminata: deSters };
  }

  test('1. Ștergerea optimistă scade exact valorile mesei eliminate', () => {
    const totaluriInit = { calorii: 500, proteine: 45, grasimi: 23, carbohidrati: 15, numarMese: 2 };
    const rez = executaStergereOptimista(meseInitial, 'm1', totaluriInit);

    expect(rez.mese.length).toBe(1);
    expect(rez.mese[0].id).toBe('m2');
    expect(rez.calorii).toBe(200);
    expect(rez.proteine).toBe(20);
    expect(rez.grasimi).toBe(8);
    expect(rez.carbohidrati).toBe(10);
    expect(rez.numarMese).toBe(1);
  });

  test('2. Rollback-ul la eroare reface starea exactă anterioară', () => {
    const totaluriInit = { calorii: 500, proteine: 45, grasimi: 23, carbohidrati: 15, numarMese: 2 };
    const rez = executaStergereOptimista(meseInitial, 'm1', totaluriInit);

    // Re-adaugare masa la esec DB
    const reusitRollback = [rez.masaEliminata!, ...rez.mese];
    expect(reusitRollback.length).toBe(2);
    expect(reusitRollback[0].id).toBe('m1');
  });
});

describe('S10 (U-09) — UI Optimist pentru ADĂUGAREA meselor', () => {
  // Oglindă a `optimisticAddMeal` din hooks/useMeseAzi.ts (prepend + totaluri mărite,
  // plafonate la același safeTotal ca în fetchData). Păstrăm logica ca funcție pură,
  // la fel ca ștergerea optimistă de mai sus.
  type Totaluri = { calorii: number; proteine: number; grasimi: number; carbohidrati: number; numarMese: number };

  function executaAdaugareOptimista(
    prevMese: Masa[],
    masaNoua: Masa,
    stateTotaluri: Totaluri
  ): { mese: Masa[] } & Totaluri {
    const noiMese = [masaNoua, ...prevMese];
    return {
      mese: noiMese,
      calorii: Math.min(100000, Math.max(0, stateTotaluri.calorii + (masaNoua.calorii || 0))),
      proteine: Math.min(5000, Math.max(0, stateTotaluri.proteine + (masaNoua.proteine || 0))),
      grasimi: Math.min(5000, Math.max(0, stateTotaluri.grasimi + (masaNoua.grasimi || 0))),
      carbohidrati: Math.min(5000, Math.max(0, stateTotaluri.carbohidrati + (masaNoua.carbohidrati || 0))),
      numarMese: stateTotaluri.numarMese + 1,
    };
  }

  const masaNoua: Masa = {
    id: 'm3',
    user_id: 'user_123',
    nume: 'Prăjită cu mere',
    calorii: 180,
    proteine: 5,
    grasimi: 9,
    carbohidrati: 22,
    fibre: 2,
    tip_masa: 'gustare',
    created_at: '2026-08-07T13:00:00Z',
  };

  // Fixture proprie (meseInitial e local la describe-ul de mai sus)
  const meseInicial: Masa[] = [
    {
      id: 'm1',
      user_id: 'user_123',
      nume: 'Omletă cu brânză',
      calorii: 300,
      proteine: 25,
      grasimi: 15,
      carbohidrati: 5,
      fibre: 0,
      tip_masa: 'mic_dejun',
      created_at: '2026-08-07T12:00:00Z',
    },
    {
      id: 'm2',
      user_id: 'user_123',
      nume: 'Salată cu ton',
      calorii: 200,
      proteine: 20,
      grasimi: 8,
      carbohidrati: 10,
      fibre: 0,
      tip_masa: 'pranz',
      created_at: '2026-08-07T12:00:00Z',
    },
  ];

  test('1. Adăugarea optimistă pune masa în față și adună exact valorile ei', () => {
    const totaluriInit: Totaluri = { calorii: 500, proteine: 45, grasimi: 23, carbohidrati: 15, numarMese: 2 };
    const rez = executaAdaugareOptimista(meseInicial, masaNoua, totaluriInit);

    expect(rez.mese.length).toBe(3);
    expect(rez.mese[0].id).toBe('m3');
    expect(rez.calorii).toBe(680);
    expect(rez.proteine).toBe(50);
    expect(rez.grasimi).toBe(32);
    expect(rez.carbohidrati).toBe(37);
    expect(rez.numarMese).toBe(3);
  });

  test('2. Totalurile sunt plafonate ca în fetchData (nu explodează la adunare)', () => {
    const totaluriPestePlafon: Totaluri = { calorii: 99920, proteine: 4999, grasimi: 4999, carbohidrati: 4999, numarMese: 50 };
    const rez = executaAdaugareOptimista([meseInicial[0]], masaNoua, totaluriPestePlafon);

    expect(rez.calorii).toBe(100000);       // 99920 + 180 → clamp la 100000
    expect(rez.proteine).toBe(5000);        // 4999 + 5   → clamp la 5000
    expect(rez.grasimi).toBe(5000);         // 4999 + 9   → clamp la 5000
    expect(rez.carbohidrati).toBe(5000);    // 4999 + 22  → clamp la 5000
    expect(rez.numarMese).toBe(51);
  });
});
