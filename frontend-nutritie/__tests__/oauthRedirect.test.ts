jest.mock('../supabase', () => ({ supabase: { auth: {} } }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));

describe('OAuth native application identity', () => {
  afterEach(() => jest.resetModules());

  it.each([
    ['getflow-qa', 'getflow-qa://auth/callback'],
    [['getflow-qa'], 'getflow-qa://auth/callback'],
    ['nutriai', 'nutriai://auth/callback'],
  ])('uses the effective registered scheme %j', (scheme, expected) => {
    jest.doMock('expo-constants', () => ({
      __esModule: true, default: { expoConfig: { scheme } },
    }));
    const { OAUTH_REDIRECT_URI } = jest.requireActual<typeof import('../lib/oauthFlow')>('../lib/oauthFlow');
    expect(OAUTH_REDIRECT_URI).toBe(expected);
  });
});
