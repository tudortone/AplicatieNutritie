const fs = require('fs');
const content = fs.readFileSync('frontend-nutritie/hooks/useMeseAzi.ts', 'utf8');

const updated = content.replace(
  /\/\/ Fallback la AsyncStorage\r?\n\s*\/\/ Fallback la AsyncStorage paralelizat/g,
  '// Fallback la AsyncStorage paralelizat'
);

fs.writeFileSync('frontend-nutritie/hooks/useMeseAzi.ts', updated);
