module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|decode-uri-component)',
  ],
  setupFilesAfterEnv: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Testele de componenta (RNTL v14: `render()` intoarce un Promise) trec in
  // ~0.5s izolat, dar depaseau timeout-ul implicit de 5s cand intreaga suita
  // ruleaza serial (`test:ci` foloseste --runInBand): prima randare plateste
  // transformarea Babel a arborelui react-native/expo-router sub presiune de
  // memorie. Rezultatul era un gate CI rosu nedeterminist (nouaParola.test.tsx
  // si oauthCallback.test.tsx), nu un defect de produs.
  testTimeout: 30000,
};
