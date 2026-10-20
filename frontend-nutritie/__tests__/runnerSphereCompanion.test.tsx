import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RunnerSphere, RUN_FRAMES, IDLE_FRAME, interpolateRunnerFrame } from '../components/home/RunnerSphere';
import { PixelCompanion } from '../components/home/PixelCompanion';
import { RunnerSphereCompanionCluster } from '../components/home/RunnerSphereCompanionCluster';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: any) => {
    require('react').useEffect(cb, [cb]);
  },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

// Mock useReducedMotion
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

// Mock AuthContext
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: {
      access_token: 'test_token',
      user: { id: 'test_user_id' },
    },
  }),
}));

// Mock photoJobs
jest.mock('../lib/photoJobs', () => ({
  recoverPhotoJob: jest.fn().mockResolvedValue({
    job: { id: 'job_123', status: 'idle' },
    pointer: { userId: 'test_user_id', jobId: 'job_123', savedAt: Date.now() },
  }),
  clearActivePhotoJob: jest.fn(),
}));

const photoJobs = jest.requireMock('../lib/photoJobs') as {
  recoverPhotoJob: jest.Mock;
  clearActivePhotoJob: jest.Mock;
};

beforeEach(() => {
  mockPush.mockClear();
  photoJobs.clearActivePhotoJob.mockClear();
});

describe('RunnerSphere Component', () => {
  it('renders idle state with accessible label', async () => {
    const onPress = jest.fn();
    const view = await render(
      <RunnerSphere state="idle" onPress={onPress} size={44} />
    );

    const widget = view.getByTestId('runner-sphere-widget');
    expect(widget).toBeTruthy();
    expect(view.getByLabelText('Sferă Runner GetFlow. Atingeți pentru camera foto.')).toBeTruthy();

    fireEvent.press(widget);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders processing state while analysis is running', async () => {
    const onPress = jest.fn();
    const view = await render(
      <RunnerSphere state="processing" onPress={onPress} size={44} />
    );

    const widget = view.getByTestId('runner-sphere-widget');
    expect(widget).toBeTruthy();
    expect(view.getByLabelText('Analiză foto în desfășurare. Atingeți pentru stare.')).toBeTruthy();
  });

  it('renders completed state with checkmark badge', async () => {
    const onPress = jest.fn();
    const view = await render(
      <RunnerSphere state="completed" onPress={onPress} size={44} />
    );

    const widget = view.getByTestId('runner-sphere-widget');
    expect(widget).toBeTruthy();
    expect(view.getByLabelText('Analiză foto finalizată. Atingeți pentru a deschide rezultatul.')).toBeTruthy();
  });

  it('features an authentic 6-phase running gait cycle with alternating limbs and depth shading', () => {
    expect(RUN_FRAMES).toHaveLength(6);
    // Frame 0 has near leg extended forward and far leg back
    expect(RUN_FRAMES[0].nearLeg).toContain('18 20.8');
    expect(RUN_FRAMES[0].farLeg).toContain('5 18.5');

    // Frame 3 alternates: near leg kicked back and far leg extended forward
    expect(RUN_FRAMES[3].nearLeg).toContain('5 18.5');
    expect(RUN_FRAMES[3].farLeg).toContain('18 20.8');

    // Verify arms also alternate
    expect(RUN_FRAMES[0].nearArm).toContain('7.8 11.8');
    expect(RUN_FRAMES[3].nearArm).toContain('17.5 7.8');

    // Verify idle frame is a balanced resting stance
    expect(IDLE_FRAME.torso).toBe('M 12 6.3 L 12 13.5');
  });

  it('interpolates between poses rather than snapping six full silhouettes', async () => {
    const middle = interpolateRunnerFrame(0.5);
    expect(middle.head.cy).toBeCloseTo(4.5);
    expect(middle.nearLeg).toContain('13.5 16.5');
    expect(interpolateRunnerFrame(6)).toEqual(interpolateRunnerFrame(0));
    expect(interpolateRunnerFrame(5.999).head.cx).toBeCloseTo(RUN_FRAMES[0].head.cx, 2);
    const view = await render(<RunnerSphere state="processing" onPress={() => {}} />);
    expect(view.getAllByTestId('runner-figure')).toHaveLength(1);
  });
});

describe('PixelCompanion Component', () => {
  it('renders pixel creature with calculated level from streak', async () => {
    const onPress = jest.fn();
    const view = await render(
      <PixelCompanion streak={6} onPress={onPress} size={32} />
    );

    expect(view.getByTestId('pixel-companion-widget')).toBeTruthy();
    expect(view.getByText('Lv 3')).toBeTruthy();

    fireEvent.press(view.getByTestId('pixel-companion-widget'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('RunnerSphereCompanionCluster Component', () => {
  it('opens the failed job in Camera without discarding its recovery pointer', async () => {
    photoJobs.recoverPhotoJob.mockResolvedValueOnce({
      job: { id: 'job_failed', status: 'failed', errorCode: 'ANALYSIS_FAILED' },
      pointer: { userId: 'test_user_id', jobId: 'job_failed', savedAt: Date.now() },
    });
    const view = await render(<RunnerSphereCompanionCluster />);
    await waitFor(() => expect(view.getByLabelText('Analiză foto eșuată. Atingeți pentru reîncercare.')).toBeTruthy());

    fireEvent.press(view.getByTestId('runner-sphere-widget'));

    expect(mockPush).toHaveBeenCalledWith('/camera');
    expect(photoJobs.clearActivePhotoJob).not.toHaveBeenCalled();
  });
  it('renders both sphere and companion side by side in cluster', async () => {
    const onCompanionPress = jest.fn();
    const view = await render(
      <RunnerSphereCompanionCluster streak={3} onCompanionPress={onCompanionPress} />
    );

    await waitFor(() => {
      expect(view.getByTestId('runner-sphere-companion-cluster')).toBeTruthy();
      expect(view.getByTestId('runner-sphere-widget')).toBeTruthy();
      expect(view.getByTestId('pixel-companion-widget')).toBeTruthy();
    });
  });
});
