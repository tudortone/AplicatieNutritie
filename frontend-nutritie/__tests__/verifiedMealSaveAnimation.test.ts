import { aboneazaLaMeseSalvateVerificat, anuntaMasaSalvataVerificat } from '../lib/freshnessMese';

describe('verified meal-save animation signal', () => {
  it('emits an idempotent event with identifiers only after the caller confirms persistence', () => {
    const listener = jest.fn();
    const unsubscribe = aboneazaLaMeseSalvateVerificat(listener);
    const id = `ring-event-${Date.now()}`;
    anuntaMasaSalvataVerificat('user-ring-test', [id], ['2026-10-09']);
    anuntaMasaSalvataVerificat('user-ring-test', [id], ['2026-10-09']);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-ring-test',
      mealIds: [id],
      dayKeys: ['2026-10-09'],
      revision: expect.any(Number),
    });
    expect(listener.mock.calls[0]?.[0]).not.toHaveProperty('calories');
  });

  it('ignores empty identifiers and invalid day keys', () => {
    const listener = jest.fn();
    const unsubscribe = aboneazaLaMeseSalvateVerificat(listener);
    anuntaMasaSalvataVerificat('user-ring-empty', ['undefined', ''], ['tomorrow']);
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});
