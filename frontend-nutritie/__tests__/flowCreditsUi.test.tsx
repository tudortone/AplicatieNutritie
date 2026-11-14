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
    balanceReady: true,
    loading: false,
    unlimited: false,
    visible: true,
    rewardState: 'idle',
    creditProducts: [
      { id: 'getflow_credits_10', title: '10', description: '', displayPrice: '6,99 RON', currencyCode: 'RON' },
      { id: 'getflow_credits_30', title: '30', description: '', displayPrice: '14,99 RON', currencyCode: 'RON' },
    ],
    purchaseStatus: { status: 'idle' },
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

  test('shows daily rewarded limit explanation at idle when rewardedGrantsRemaining is 0', async () => {
    mockFlowState.balance.rewardedGrantsRemaining = 0;
    const screen = await render(<FlowCreditsModalHost />);
    expect(screen.getByText("Today's rewarded credit limit has been reached.")).toBeTruthy();
    const watchAdBtn = screen.getByRole('button', { name: 'Watch ad · +1' });
    expect(watchAdBtn.props.accessibilityState.disabled).toBe(true);
  });

  test('pressing backdrop dismisses the Flow Credits sheet', async () => {
    const screen = await render(<FlowCreditsModalHost />);
    await fireEvent.press(screen.getByTestId('flow-credits-backdrop'));
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('displays billing status feedback and disables packs during purchase verification', async () => {
    mockFlowState.purchaseStatus = { status: 'verifying' };
    const screen = await render(<FlowCreditsModalHost />);
    expect(screen.getByTestId('flow-credits-purchase-busy')).toBeTruthy();
    expect(screen.getByText('Processing purchase…')).toBeTruthy();
    await fireEvent.press(screen.getByText('30 Flow Credits'));
    expect(mockPurchase).not.toHaveBeenCalled();

    mockFlowState.purchaseStatus = { status: 'pending' };
    await screen.rerender(<FlowCreditsModalHost />);
    expect(screen.getByTestId('flow-credits-purchase-pending')).toBeTruthy();

    mockFlowState.purchaseStatus = { status: 'error' };
    await screen.rerender(<FlowCreditsModalHost />);
    expect(screen.getByTestId('flow-credits-purchase-error')).toBeTruthy();
  });

  test('displays Continue to scan CTA after earning a credit and closes modal on press', async () => {
    mockFlowState.rewardState = 'granted';
    const screen = await render(<FlowCreditsModalHost />);
    const continueBtn = screen.getByTestId('flow-credits-continue-btn');
    expect(continueBtn).toBeTruthy();
    expect(screen.getByText('Continue to scan')).toBeTruthy();
    await fireEvent.press(continueBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

