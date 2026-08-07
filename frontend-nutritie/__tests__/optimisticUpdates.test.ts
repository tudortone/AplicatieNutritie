import { Masa } from '../types';

describe('U-09 — UI Optimist pentru ștergerea meselor', () => {
  const initialMese: Masa[] = [
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

  function optimisticDelete(meseList: Masa[], id: string) {
    const masaDeSters = meseList.find((m) => m.id === id);
    const meseRamase = meseList.filter((m) => m.id !== id);

    const totalCalorii = meseRamase.reduce((s, m) => s + (m.calorii || 0), 0);
    const totalProteine = meseRamase.reduce((s, m) => s + (m.proteine || 0), 0);

    return {
      mese: meseRamase,
      totalCalorii,
      totalProteine,
      sterse: masaDeSters,
    };
  }

  test('1. Ștergerea optimistă elimină masa și actualizează instantaneu totalurile', () => {
    const rez = optimisticDelete(initialMese, 'm1');

    expect(rez.mese.length).toBe(1);
    expect(rez.mese[0].id).toBe('m2');
    expect(rez.totalCalorii).toBe(200);
    expect(rez.totalProteine).toBe(20);
  });

  test('2. Dacă ștergerea din DB eșuează, starea poate fi restaurată prin re-adaugarea mesei inițiale', () => {
    const rez = optimisticDelete(initialMese, 'm1');
    expect(rez.mese.length).toBe(1);

    // Rollback optimist
    const restaurat = [rez.sterse!, ...rez.mese];
    expect(restaurat.length).toBe(2);
    expect(restaurat[0].id).toBe('m1');
  });
});
