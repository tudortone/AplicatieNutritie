const mockSetItem = jest.fn(async (_key: string, _value: string) => undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: (key: string, value: string) => mockSetItem(key, value),
}));
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => { throw new Error('MMKV indisponibil în test'); },
}));

import { useAppStore } from '../hooks/useAppStore';

describe('persistența flagului de onboarding', () => {
  beforeEach(() => mockSetItem.mockClear());

  it('expune o promisiune pe care fluxul final o poate aștepta înainte de navigare', async () => {
    const salvare = useAppStore.getState().setOnboardingDone(true);

    expect(salvare).toBeInstanceOf(Promise);
    await salvare;
    expect(mockSetItem).toHaveBeenCalledWith('nutriai-onboarding_done', 'true');
  });
});
