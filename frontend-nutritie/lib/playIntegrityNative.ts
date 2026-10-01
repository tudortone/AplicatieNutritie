import { Platform } from 'react-native';

import { createPlayIntegrityClient, type PlayIntegrityRequest } from './playIntegrity';

function getAppIntegrity() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@expo/app-integrity');
  } catch {
    return null;
  }
}

const integrity = getAppIntegrity();

const client = createPlayIntegrityClient({
  platform: Platform.OS,
  cloudProjectNumber: process.env.EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER || '',
  prepare: integrity?.prepareIntegrityTokenProviderAsync ?? (async () => {}),
  requestToken: integrity?.requestIntegrityCheckAsync ?? (async () => ''),
});

export function getPlayIntegrityHeaders(input: PlayIntegrityRequest): Promise<Record<string, string>> {
  return client.headers(input);
}
