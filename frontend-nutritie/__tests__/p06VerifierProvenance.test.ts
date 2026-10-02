import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const {
  parseMergedManifest,
  verifyPermissionPolicy,
  resolveManifestInput,
  runDisposableReleaseManifestMerge,
  getExistingPathKey,
  prependPathToEnv,
  buildReleaseVerifierEnv,
  EXPECTED_PACKAGE,
  EXPECTED_MIN_SDK,
  EXPECTED_TARGET_SDK,
  FORBIDDEN_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} = require('../scripts/verifyAndroidReleasePermissions');

describe('P0-06 Verifier Provenance & XML Parsing (Unit Regression)', () => {
  describe('1. XML Parsing & Comment Ignoring', () => {
    it('RED TEST: ignores <uses-permission> tags inside XML comments', () => {
      const xmlWithComments = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    
    <!-- Commented permission example that regex mistakenly parses: -->
    <!-- <uses-permission android:name="android.permission.RECORD_AUDIO" /> -->
    <!-- <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" /> -->
    
    <!-- Active permissions -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>`;

      const parsed = parseMergedManifest(xmlWithComments);

      // Comments must NOT be included
      expect(parsed.permissions).not.toContain('android.permission.RECORD_AUDIO');
      expect(parsed.permissions).not.toContain('android.permission.READ_EXTERNAL_STORAGE');
      
      // Real active permissions must be included
      expect(parsed.permissions).toContain('android.permission.CAMERA');
      expect(parsed.permissions).toContain('android.permission.INTERNET');
      expect(parsed.permissions).toHaveLength(2);
    });

    it('RED TEST: counts real structural <uses-permission> elements accurately', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
    <uses-permission android:name="android.permission.INTERNET" />
    <!-- <uses-permission android:name="android.permission.VIBRATE" /> -->
</manifest>`;

      const parsed = parseMergedManifest(xml);
      expect(parsed.permissions).toHaveLength(3);
      expect(parsed.permissions).toEqual([
        'android.permission.CAMERA',
        'android.permission.ACTIVITY_RECOGNITION',
        'android.permission.INTERNET',
      ]);
    });
  });

  describe('2. SDK Provenance', () => {
    it('RED TEST: does NOT silently substitute targetSdkVersion when compileSdkVersion is absent from manifest', () => {
      const xmlWithoutCompileSdk = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.CAMERA" />
</manifest>`;

      const parsed = parseMergedManifest(xmlWithoutCompileSdk);
      // compileSdkVersion must NOT be faked from targetSdkVersion
      expect(parsed.compileSdkVersion).toBeNull();
    });

    it('extracts compileSdkVersion when explicitly present on manifest element', () => {
      const xmlWithCompileSdk = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.totsrl.getflo"
    android:compileSdkVersion="36">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.CAMERA" />
</manifest>`;

      const parsed = parseMergedManifest(xmlWithCompileSdk);
      expect(parsed.compileSdkVersion).toBe('36');
    });

    it('verifyPermissionPolicy fails when compileSdkVersion cannot be proven', () => {
      const sample = {
        package: EXPECTED_PACKAGE,
        minSdkVersion: EXPECTED_MIN_SDK,
        targetSdkVersion: EXPECTED_TARGET_SDK,
        compileSdkVersion: null, // unproven!
        permissions: ['android.permission.CAMERA'],
      };

      const result = verifyPermissionPolicy(sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.toLowerCase().includes('compilesdk'))).toBe(true);
    });
  });

  describe('3. Permission Policy Validation', () => {
    it('fails when forbidden permission is present', () => {
      const sample = {
        package: EXPECTED_PACKAGE,
        minSdkVersion: EXPECTED_MIN_SDK,
        targetSdkVersion: EXPECTED_TARGET_SDK,
        compileSdkVersion: '36',
        permissions: [
          'android.permission.CAMERA',
          'android.permission.RECORD_AUDIO',
        ],
      };

      const result = verifyPermissionPolicy(sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('RECORD_AUDIO'))).toBe(true);
    });

    it('fails when required CAMERA permission is missing', () => {
      const sample = {
        package: EXPECTED_PACKAGE,
        minSdkVersion: EXPECTED_MIN_SDK,
        targetSdkVersion: EXPECTED_TARGET_SDK,
        compileSdkVersion: '36',
        permissions: ['android.permission.INTERNET'],
      };

      const result = verifyPermissionPolicy(sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('CAMERA'))).toBe(true);
    });
  });

  describe('4. Fail-Closed Explicit --manifest & Ambient Discovery Elimination', () => {
    it('RED TEST: resolveManifestInput with nonexistent explicit path FAILS IMMEDIATELY without searching ambient dirs', () => {
      const nonexistentPath = path.join(os.tmpdir(), 'definitely-nonexistent-manifest-' + Date.now() + '.xml');

      expect(() => {
        resolveManifestInput({ manifestPath: nonexistentPath });
      }).toThrow(/not found/i);
    });

    it('RED TEST: default mode NEVER scans previous getflow-prebuild-* directories', () => {
      // Create a fake poisoned old prebuild directory
      const poisonedDir = path.join(os.tmpdir(), 'getflow-prebuild-9999999999999');
      const poisonedManifestDir = path.join(
        poisonedDir,
        'android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest'
      );
      fs.mkdirSync(poisonedManifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(poisonedManifestDir, 'AndroidManifest.xml'),
        '<manifest package="poisoned.manifest"></manifest>'
      );

      try {
        if (typeof resolveManifestInput === 'function') {
          const res = resolveManifestInput({ projectRoot: path.resolve(__dirname, '..') });
          if (res && res.manifestPath) {
            expect(res.manifestPath).not.toContain('getflow-prebuild-9999999999999');
          }
        }
      } finally {
        try {
          fs.rmSync(poisonedDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('RED TEST: default mode NEVER falls back to local /android output', () => {
      const fakeRoot = path.join(os.tmpdir(), 'test-fake-root-' + Date.now());
      const localMergedDir = path.join(
        fakeRoot,
        'android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest'
      );
      fs.mkdirSync(localMergedDir, { recursive: true });
      fs.writeFileSync(
        path.join(localMergedDir, 'AndroidManifest.xml'),
        '<manifest package="fake.local.android"></manifest>'
      );

      try {
        if (typeof resolveManifestInput === 'function') {
          const res = resolveManifestInput({ projectRoot: fakeRoot });
          if (res && res.manifestPath) {
            expect(res.manifestPath).not.toContain(fakeRoot);
          }
        }
      } finally {
        try {
          fs.rmSync(fakeRoot, { recursive: true, force: true });
        } catch {}
      }
    });
  });

  describe('5. Temporary Workspace Cleanup', () => {
    it('temporary workspace is cleaned up on failure in runDisposableReleaseManifestMerge', () => {
      let createdDir: string | null = null;
      try {
        runDisposableReleaseManifestMerge({
          projectRoot: path.resolve(__dirname, '..'),
          execOverride: () => {
            throw new Error('Simulated prebuild failure');
          },
          onDirCreated: (dir: string) => {
            createdDir = dir;
          },
        });
      } catch {
        // Expected to throw
      }

      expect(createdDir).toBeTruthy();
      if (createdDir) {
        expect(fs.existsSync(createdDir)).toBe(false);
      }
    });

    it('temporary workspace is cleaned up on success in runDisposableReleaseManifestMerge', () => {
      let createdDir: string | null = null;
      const res = runDisposableReleaseManifestMerge({
        projectRoot: path.resolve(__dirname, '..'),
        execOverride: (cmd: string, opts: { cwd: string }) => {
          // If running gradle, write mock manifest file so merge succeeds
          if (cmd.includes('processReleaseMainManifest')) {
            const manifestDir = path.join(
              opts.cwd,
              'app/build/intermediates/merged_manifest/release/processReleaseMainManifest'
            );
            fs.mkdirSync(manifestDir, { recursive: true });
            fs.writeFileSync(
              path.join(manifestDir, 'AndroidManifest.xml'),
              '<manifest package="com.totsrl.getflo"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" /><uses-permission android:name="android.permission.CAMERA" /></manifest>'
            );
            return '[ExpoRootProject] Using compileSdk: 36';
          }
          return '';
        },
        onDirCreated: (dir: string) => {
          createdDir = dir;
        },
      });

      expect(res.manifestContent).toContain('com.totsrl.getflo');
      expect(res.compileSdkVersion).toBe('36');
      expect(createdDir).toBeTruthy();
      if (createdDir) {
        expect(fs.existsSync(createdDir)).toBe(false);
      }
    });
  });

  describe('6. Real Subprocess PATH Preservation & Windows Case-Sensitivity (Regression)', () => {
    it('RED TEST: getExistingPathKey correctly identifies Path, PATH, or path', () => {
      expect(getExistingPathKey({ Path: 'C:\\test' })).toBe('Path');
      expect(getExistingPathKey({ PATH: '/usr/bin' })).toBe('PATH');
      expect(getExistingPathKey({ path: 'C:\\test' })).toBe('path');
      expect(getExistingPathKey({})).toBe(process.platform === 'win32' ? 'Path' : 'PATH');
    });

    it('RED TEST: prependPathToEnv preserves existing search path when given Path without PATH', () => {
      const simulatedEnv: Record<string, string> = { Path: 'C:\\original\\system32' };
      const jbrBin = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin';
      prependPathToEnv(simulatedEnv, jbrBin);

      expect(simulatedEnv.Path).toBe(`${jbrBin}${path.delimiter}C:\\original\\system32`);
      expect((simulatedEnv as any).PATH).toBeUndefined();
    });

    it('RED TEST: prependPathToEnv preserves existing search path when given PATH', () => {
      const simulatedEnv: Record<string, string> = { PATH: '/usr/bin' };
      const customBin = '/custom/jbr/bin';
      prependPathToEnv(simulatedEnv, customBin);

      expect(simulatedEnv.PATH).toBe(`${customBin}${path.delimiter}/usr/bin`);
      expect((simulatedEnv as any).Path).toBeUndefined();
    });

    (process.platform === 'win32' ? it : it.skip)(
      'REAL SUBPROCESS: buildReleaseVerifierEnv allows npx/npm/node to be resolved on Windows when input env only has Path',
      () => {
      // Simulate real Windows environment where inherited search path is keyed strictly as 'Path'
      const systemPath = process.env.Path || process.env.PATH || '';
      expect(systemPath).toBeTruthy();

      const baseWindowsEnv: Record<string, string> = {
        SystemRoot: process.env.SystemRoot || 'C:\\Windows',
        WINDIR: process.env.WINDIR || 'C:\\Windows',
        TEMP: process.env.TEMP || os.tmpdir(),
        TMP: process.env.TMP || os.tmpdir(),
        Path: systemPath, // ONLY 'Path', deliberately NO 'PATH'
      };
      delete baseWindowsEnv.PATH;

      const dummyJbr = path.join(os.tmpdir(), 'dummy-jbr-test');
      const constructedEnv = buildReleaseVerifierEnv(baseWindowsEnv, {
        javaHome: dummyJbr,
      });

      // 1. Assert Path is preserved and prepended
      const activePathKey = getExistingPathKey(constructedEnv);
      expect(constructedEnv[activePathKey]).toBeTruthy();
      expect(constructedEnv[activePathKey].startsWith(path.join(dummyJbr, 'bin'))).toBe(true);
      expect(constructedEnv[activePathKey]).toContain(systemPath);

      // 2. REAL SUBPROCESS: Actually spawn a PATH-resolved executable through child_process.execSync
      // using the constructed environment — proves no case mismatch dropped the executable search path!
      const out = execSync('npx --version', {
        env: constructedEnv,
        encoding: 'utf-8',
        stdio: 'pipe',
        shell: process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : undefined,
      });

      expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
});


