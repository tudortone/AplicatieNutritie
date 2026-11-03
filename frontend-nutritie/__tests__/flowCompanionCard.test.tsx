import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlowCompanionCard } from '../components/home/FlowCompanionCard';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#090C0E',
      cardBg: '#14181A',
      cardBorder: '#262D30',
      accent: '#C5F467',
      textPrimary: '#FFFFFF',
      textSecondary: '#8B93A0',
    },
  }),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: {
      access_token: 'test_token',
      user: { id: 'test_user_id' },
    },
  }),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: any) => {
    require('react').useEffect(cb, [cb]);
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('../lib/photoJobs', () => ({
  recoverPhotoJob: jest.fn().mockResolvedValue(null),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: any) => (typeof def === 'string' ? def : key),
  }),
}));

describe('FlowCompanionCard Component', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders companion name, stage, beacon status, and handles press', async () => {
    const onPress = jest.fn();
    const view = await render(
      <FlowCompanionCard
        streak={7}
        caloriiConsumate={1200}
        caloriiTinta={2000}
        onPress={onPress}
      />
    );

    expect(view.getByTestId('home-flow-companion-card')).toBeTruthy();
    expect(view.getByText('Sprout')).toBeTruthy();
    expect(view.getByText('Râs Electric')).toBeTruthy();
    expect(view.getByText('În grafic')).toBeTruthy();

    fireEvent.press(view.getByTestId('home-flow-companion-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders customized companion name when saved in storage', async () => {
    await AsyncStorage.setItem('@getflow:companion_name_test_user_id', 'CyberLynx');
    const view = await render(
      <FlowCompanionCard
        streak={3}
        caloriiConsumate={500}
        caloriiTinta={2000}
        userId="test_user_id"
        onPress={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(view.getByText('CyberLynx')).toBeTruthy();
    });
  });

  it('displays active analyzing food message when photo job is in progress', async () => {
    const photoJobs = require('../lib/photoJobs');
    photoJobs.recoverPhotoJob.mockResolvedValueOnce({
      job: { id: 'job_running_1', status: 'running' },
      pointer: { userId: 'test_user_id', jobId: 'job_running_1', savedAt: Date.now() },
    });

    const view = await render(
      <FlowCompanionCard
        streak={0}
        caloriiConsumate={100}
        caloriiTinta={2000}
        onPress={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(view.getByText(/⚡ Analizez mâncarea ta/)).toBeTruthy();
    });
  });
});

