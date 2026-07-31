const fs = require('fs');
const content = fs.readFileSync('frontend-nutritie/hooks/useHealthSync.ts', 'utf8');

const updated = content.replace(
  /useEffect\(\(\) => \{\s*const handleAppStateChange = \(nextAppState: AppStateStatus\) => \{\s*if \(appState\.current\.match\(\/inactive\|background\/\) && nextAppState === 'active'\) \{\s*if \(isEnabled\) \{\s*fetchStepsToday\(\);\s*\}\s*\}\s*appState\.current = nextAppState;\s*\};\s*const sub = AppState\.addEventListener\('change', handleAppStateChange\);\s*return \(\) => sub\.remove\(\);\s*\}, \[isEnabled, isAvailable, weight\]\);/g,
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
console.log('useHealthSync updated');
