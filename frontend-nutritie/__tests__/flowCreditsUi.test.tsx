import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import '../i18n';
import { FlowCreditsPill } from '../components/FlowCreditsPill';
import { FlowCreditsModalHost } from '../components/FlowCreditsModalHost';

const mockOpen = jest.fn();
const mockClose = jest.fn();
const mockWatchRewarded = jest.fn();
const mockPurchase = jest.fn();
const mockPush = jest.fn();
let mockFlowState: any;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    surface: '#12161A', cardBorder: '#333', textPrimary: '#fff', textSecondary: '#aaa',
    textTertiary: '#888', warning: '#fb0', gold: '#fd5',
  } }),
}));
jest.mock('../context/FlowCreditsContext', () => ({ useFlowCredits: () => mockFlowState }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFlowState = {
    balance: { dailyRemaining: 2, rewarded: 1, purchased: 7, total: 10, rewardedGrantsRemaining: 4, serverDay: '2026-09-21' },
    loading: false,
    unlimited: false,
    visible: true,
    rewardState: 'idle',
    creditProducts: [
      { id: 'getflow_credits_10', title: '10', description: '', displayPrice: '6,99 RON', currencyCode: 'RON' },
      { id: 'getflow_credits_30', title: '30', description: '', displayPrice: '14,99 RON', currencyCode: 'RON' },
    ],
    open: mockOpen,
    close: mockClose,
    refresh: jest.fn(),
    watchRewarded: mockWatchRewarded,
    purchase: mockPurchase,
  };
});

afterEach(async () => { await cleanup(); });

describe('Flow Credits production UI', () => {
  test('full-access sheet does not offer a rewarded-ad action', async () => {
    mockFlowState.unlimited = true;
    const screen = await render(<FlowCreditsModalHost />);
    expect(await screen.findByText('∞')).toBeTruthy();
    expect(screen.queryByText('Watch ad · +1')).toBeNull();
    expect(mockWatchRewarded).not.toHaveBeenCalled();
  });

  test('rewarded action stays disabled while access entitlement is loading', async () => {
    mockFlowState.loading = true;
    const screen = await render(<FlowCreditsModalHost />);
    const action = screen.getByRole('button', { name: 'Loading...' });
    expect(action.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(action);
    expect(mockWatchRewarded).not.toHaveBeenCalled();
  });

  test('pill displays the authoritative balance and opens the sheet', async () => {
    const screen = await render(<FlowCreditsPill />);
    expect(screen.getByText('10')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button'));
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  test('sheet exposes the two Play-priced packs and rewarded action', async () => {
    const screen = await render(<FlowCreditsModalHost />);
    expect(screen.getByText('6,99 RON')).toBeTruthy();
    expect(screen.getByText('14,99 RON')).toBeTruthy();
    await fireEvent.press(screen.getByText('Watch ad · +1'));
    expect(mockWatchRewarded).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('30 Flow Credits'));
    expect(mockPurchase).toHaveBeenCalledWith(expect.objectContaining({ id: 'getflow_credits_30' }));
  });

  test('unavailable ad state displays localized explanation and active retry action', async () => {
    mockFlowState.rewardState = 'unavailable';
    const screen = await render(<FlowCreditsModalHost />);
    expect(await screen.findByText('Retry ad · +1')).toBeTruthy();
    expect(screen.getByText('The advertisement is currently unavailable. Please try again later.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry ad · +1'));
    expect(mockWatchRewarded).toHaveBeenCalledTimes(1);
  });
});

