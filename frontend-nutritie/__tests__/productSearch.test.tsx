import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ProductSearch } from '../components/food/ProductSearch';
import { changeLanguage } from '../i18n';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

const mockFetch = jest.fn();

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: {
      access_token: 'token-valid',
      user: { id: 'user-1' },
    },
  }),
}));

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#00e5ff',
      accentSecondary: '#0088ff',
      cardBg: '#111827',
      cardBorder: '#263244',
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
    },
  }),
}));

jest.mock('../supabase', () => {
  const rezultat = { data: [], error: null };
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.limit = () => query;
  query.ilike = async () => rezultat;
  query.then = (resolve: (value: typeof rezultat) => unknown) => Promise.resolve(rezultat).then(resolve);
  return { supabase: { from: () => query } };
});

jest.mock('lucide-react-native', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  const Icon = () => ReactMock.createElement(View);
  return { Search: Icon, Plus: Icon, X: Icon };
});

describe('ProductSearch — catalog extern autentificat', () => {
  const fetchOriginal = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    await changeLanguage('ro');
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([{
        code: '5941234567890',
        product_name: 'Iaurt extern verificat',
        brands: 'Ferma',
        nutriments: {
          'energy-kcal_100g': 61,
          proteins_100g: 4.2,
          carbohydrates_100g: 5.1,
          fat_100g: 2.8,
        },
      }]),
    });
  });

  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  test('trimite tokenul sesiunii si afiseaza rezultatul extern', async () => {
    const ecran = await render(
      <ProductSearch onSelectProductWithGrams={jest.fn()} />,
    );

    await fireEvent.changeText(
      ecran.getByPlaceholderText('Caută produs, brand sau aliment...'),
      'iaurt extern verificat',
    );

    await waitFor(() => expect(ecran.getByText('Iaurt extern verificat')).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/cauta-produs?q='),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-valid', Accept: 'application/json' },
      }),
    );
  });

  test('expune actiunile critice cititorului de ecran', async () => {
    const ecran = await render(
      <ProductSearch onSelectProductWithGrams={jest.fn()} onClose={jest.fn()} />,
    );

    const cautare = ecran.getByLabelText('Caută produs, brand sau aliment');
    await fireEvent.changeText(cautare, 'iaurt');

    expect(ecran.getByLabelText('Șterge textul căutării')).toBeTruthy();
    expect(ecran.getByLabelText('Închide căutarea produselor')).toBeTruthy();
    expect(ecran.getByLabelText('Introdu produsul manual')).toBeTruthy();
    await waitFor(() => expect(ecran.getByLabelText(/Adaugă Iaurt extern verificat/)).toBeTruthy());
  });

  test('foloseste limba activa si pentru chrome-ul real al cautarii', async () => {
    await changeLanguage('en');
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));
    const ecran = await render(
      <ProductSearch onSelectProductWithGrams={jest.fn()} onClose={jest.fn()} />,
    );

    const cautare = ecran.getByLabelText('Search product, brand, or food');
    await fireEvent.changeText(cautare, 'yogurt');

    expect(ecran.getByLabelText('Clear search text')).toBeTruthy();
    expect(ecran.getByLabelText('Close product search')).toBeTruthy();
    await waitFor(() => expect(ecran.getByText('Searching catalogs...')).toBeTruthy());
    expect(ecran.getByLabelText('Enter product manually')).toBeTruthy();
  });
});
