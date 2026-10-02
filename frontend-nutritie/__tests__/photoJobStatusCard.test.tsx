import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PhotoJobStatusCard } from '../components/photo/PhotoJobStatusCard';
import { recoverPhotoJob } from '../lib/photoJobs';

const mockPush = jest.fn();
const mockSession = {
  access_token: 'token-a',
  user: { id: '11111111-1111-4111-8111-111111111111' },
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    accent: '#b8ff47', accentSecondary: '#9f7aea', danger: '#ff6262',
    cardBg: '#11151b', cardBorder: '#2b313a', textPrimary: '#ffffff', textSecondary: '#a8b0bb',
  } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native', () => ({ Camera: () => null, CheckCircle2: () => null, AlertTriangle: () => null, LoaderCircle: () => null }));
jest.mock('../lib/photoJobs', () => ({ recoverPhotoJob: jest.fn() }));

const pointer = {
  userId: mockSession.user.id,
  jobId: 'job-1',
  draftUri: 'file:///durable-draft.jpg',
  savedAt: 1,
};

describe('PhotoJobStatusCard durable discoverability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recovers a pending job on mount and keeps it discoverable after navigation', async () => {
    (recoverPhotoJob as jest.Mock).mockResolvedValue({ job: { id: 'job-1', status: 'running' }, pointer });
    const view = await render(<PhotoJobStatusCard />);

    await waitFor(() => expect(view.getByTestId('photo-job-status-processing')).toBeTruthy());
    expect(view.getByText('photoJob.backgroundTitle')).toBeTruthy();
    fireEvent.press(view.getByTestId('photo-job-open'));
    expect(mockPush).toHaveBeenCalledWith('/camera');
  });

  it('makes a completed background result obvious after app reload', async () => {
    (recoverPhotoJob as jest.Mock).mockResolvedValue({
      job: { id: 'job-1', status: 'succeeded', result: { success: true, items: [{ nume: 'Soup' }] } },
      pointer,
    });
    const view = await render(<PhotoJobStatusCard />);

    await waitFor(() => expect(view.getByTestId('photo-job-status-completed')).toBeTruthy());
    expect(view.getByText('photoJob.completedTitle')).toBeTruthy();
    expect(view.queryByTestId('photo-job-spinner')).toBeNull();
  });

  it('keeps a failed job visible with a retry path and no infinite spinner', async () => {
    (recoverPhotoJob as jest.Mock).mockResolvedValue({
      job: { id: 'job-1', status: 'failed', errorCode: 'PROVIDER_FAILED' },
      pointer,
    });
    const view = await render(<PhotoJobStatusCard />);

    await waitFor(() => expect(view.getByTestId('photo-job-status-failed')).toBeTruthy());
    expect(view.getByText('photoJob.failedTitle')).toBeTruthy();
    expect(view.queryByTestId('photo-job-spinner')).toBeNull();
    fireEvent.press(view.getByTestId('photo-job-open'));
    expect(mockPush).toHaveBeenCalledWith('/camera');
  });
});
