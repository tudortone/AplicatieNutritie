const fs = require('fs');
const content = fs.readFileSync('frontend-nutritie/hooks/useMeseAzi.ts', 'utf8');

const updated = content.replace(
  /if \(\!cTinta\) \{\s*const \[storedC, storedP, storedCb, storedGr, storedG\] = await Promise\.all\(\[\s*\!cTinta \? AsyncStorage\.getItem\('caloriiTinta'\) : Promise\.resolve\(null\),\s*\!pTinta \? AsyncStorage\.getItem\('proteineTinta'\) : Promise\.resolve\(null\),\s*\!cbTinta \? AsyncStorage\.getItem\('carbiTinta'\) : Promise\.resolve\(null\),\s*\!grTinta \? AsyncStorage\.getItem\('grasimiTinta'\) : Promise\.resolve\(null\),\s*\!g \? AsyncStorage\.getItem\('greutate'\) : Promise\.resolve\(null\)\s*\]\);\s*if \(\!cTinta\) cTinta = storedC \? parseInt\(storedC\) : 2000;\s*if \(\!pTinta\) pTinta = storedP \? parseInt\(storedP\) : 150;\s*if \(\!cbTinta\) cbTinta = storedCb \? parseInt\(storedCb\) : 250;\s*if \(\!grTinta\) grTinta = storedGr \? parseInt\(storedGr\) : 70;\s*if \(\!g\) g = storedG \? parseInt\(storedG\) : 75;/g,
  `// Fallback la AsyncStorage paralelizat
      const [storedC, storedP, storedCb, storedGr, storedG] = await Promise.all([
        !cTinta ? AsyncStorage.getItem('caloriiTinta') : Promise.resolve(null),
        !pTinta ? AsyncStorage.getItem('proteineTinta') : Promise.resolve(null),
        !cbTinta ? AsyncStorage.getItem('carbiTinta') : Promise.resolve(null),
        !grTinta ? AsyncStorage.getItem('grasimiTinta') : Promise.resolve(null),
        !g ? AsyncStorage.getItem('greutate') : Promise.resolve(null)
      ]);
      
      if (!cTinta) cTinta = storedC ? parseInt(storedC) : 2000;
      if (!pTinta) pTinta = storedP ? parseInt(storedP) : 150;
      if (!cbTinta) cbTinta = storedCb ? parseInt(storedCb) : 250;
      if (!grTinta) grTinta = storedGr ? parseInt(storedGr) : 70;
      if (!g) g = storedG ? parseInt(storedG) : 75;`
);

fs.writeFileSync('frontend-nutritie/hooks/useMeseAzi.ts', updated);
