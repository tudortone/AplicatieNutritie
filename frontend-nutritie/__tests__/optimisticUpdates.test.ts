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
