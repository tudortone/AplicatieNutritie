const fs = require('fs');
const content = fs.readFileSync('frontend-nutritie/hooks/useMeseAzi.ts', 'utf8');

const updated = content.replace(
  /const storedC = await AsyncStorage\.getItem\('caloriiTinta'\);\s*cTinta = storedC \? parseInt\(storedC\) : 2000;\s*\}\s*if \(\!pTinta\) \{\s*const storedP = await AsyncStorage\.getItem\('proteineTinta'\);\s*pTinta = storedP \? parseInt\(storedP\) : 150;\s*\}\s*if \(\!cbTinta\) \{\s*const storedCb = await AsyncStorage\.getItem\('carbiTinta'\);\s*cbTinta = storedCb \? parseInt\(storedCb\) : 250;\s*\}\s*if \(\!grTinta\) \{\s*const storedGr = await AsyncStorage\.getItem\('grasimiTinta'\);\s*grTinta = storedGr \? parseInt\(storedGr\) : 70;\s*\}\s*if \(\!g\) \{\s*const storedG = await AsyncStorage\.getItem\('greutate'\);\s*g = storedG \? parseInt\(storedG\) : 75;\s*\}/g,
  `const [storedC, storedP, storedCb, storedGr, storedG] = await Promise.all([
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
console.log('useMeseAzi updated');
