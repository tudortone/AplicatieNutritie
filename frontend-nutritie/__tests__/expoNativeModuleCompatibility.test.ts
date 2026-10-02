import fs from 'fs';
import path from 'path';

describe('Expo Native Module Compatibility & AnyTypeCache Contract', () => {
  const rootDir = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(rootDir, 'package.json');
  const appIntegrityPkgPath = path.join(rootDir, 'node_modules/@expo/app-integrity/package.json');
  const expoModulesCorePkgPath = path.join(rootDir, 'node_modules/expo-modules-core/package.json');

  it('declares compatible @expo/app-integrity version in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const integrityVersion = pkg.dependencies['@expo/app-integrity'];
    expect(integrityVersion).toBe('0.1.10');
  });

  it('installs @expo/app-integrity 0.1.10 without major SDK mismatch', () => {
    const pkg = JSON.parse(fs.readFileSync(appIntegrityPkgPath, 'utf8'));
    expect(pkg.version).toBe('0.1.10');
    // Ensure devDependencies point to expo-module-scripts ^5.0.8, not 55+/56+/57+
    expect(pkg.devDependencies['expo-module-scripts']).toContain('^5.0.8');
  });

  it('installs expo-modules-core matching Expo SDK 54 (3.0.x)', () => {
    const pkg = JSON.parse(fs.readFileSync(expoModulesCorePkgPath, 'utf8'));
    expect(pkg.version).toMatch(/^3\.0\./);
  });

  it('guarantees that installed @expo/app-integrity AAR does NOT reference AnyTypeCache', () => {
    const aarPath = path.join(
      rootDir,
      'node_modules/@expo/app-integrity/local-maven-repo/expo/modules/integrity/expo.modules.integrity/0.1.10/expo.modules.integrity-0.1.10.aar'
    );
    expect(fs.existsSync(aarPath)).toBe(true);

    const aarBuffer = fs.readFileSync(aarPath);
    // AnyTypeCache was introduced in SDK 57 and causes fatal NoClassDefFoundError on SDK 54
    expect(aarBuffer.includes(Buffer.from('AnyTypeCache'))).toBe(false);
  });

  it('guarantees that expo-modules-core contains AnyTypeProvider', () => {
    const anyTypeFile = path.join(
      rootDir,
      'node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/types/AnyType.kt'
    );
    expect(fs.existsSync(anyTypeFile)).toBe(true);
    const content = fs.readFileSync(anyTypeFile, 'utf8');
    expect(content).toContain('AnyType');
    // AnyTypeCache must NOT be required by expo-modules-core 3.0.x
    expect(content).not.toContain('AnyTypeCache');
  });
});
