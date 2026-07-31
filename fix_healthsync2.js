const fs = require('fs');
const content = fs.readFileSync('frontend-nutritie/hooks/useHealthSync.ts', 'utf8');

const updated = content.replace(
  /const enableRef = useRef\(isEnabled\);\r?\n\s*useEffect\(\(\) => \{ enableRef\.current = isEnabled; \}, \[isEnabled\]\);\r?\n\r?\n\s*useEffect\(\(\) => \{\r?\n\s*const handleAppStateChange = \(nextAppState: AppStateStatus\) => \{\r?\n\s*if \(appState\.current\.match\(\/inactive\|background\/\) && nextAppState === 'active'\) \{\r?\n\s*if \(enableRef\.current\) \{\r?\n\s*fetchStepsToday\(\);\r?\n\s*\}\r?\n\s*\}\r?\n\s*appState\.current = nextAppState;\r?\n\s*\};\r?\n\s*const sub = AppState\.addEventListener\('change', handleAppStateChange\);\r?\n\s*return \(\) => sub\.remove\(\);\r?\n\s*\}, \[fetchStepsToday\]\);/g,
  `useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (isEnabled) {
          fetchStepsToday();
        }
      }
      appState.current = nextAppState;
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isEnabled, fetchStepsToday]);`
);
fs.writeFileSync('frontend-nutritie/hooks/useHealthSync.ts', updated);
