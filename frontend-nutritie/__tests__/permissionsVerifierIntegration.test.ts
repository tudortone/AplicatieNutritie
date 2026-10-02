import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawnSync } from 'child_process';

describe('P0-06 Permissions Verifier CLI & Integration Scenarios', () => {
  const verifierScript = path.resolve(__dirname, '../scripts/verifyAndroidReleasePermissions.js');

  it('negative: explicit nonexistent --manifest FAILS IMMEDIATELY with non-zero exit code', () => {
    const nonexistent = path.join(os.tmpdir(), 'definitely-missing-manifest-' + Date.now() + '.xml');
    const res = spawnSync(process.execPath, [verifierScript, '--manifest', nonexistent], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    });

    expect(res.status).not.toBe(0);
    const combined = (res.stdout || '') + (res.stderr || '');
    expect(combined).toMatch(/not found/i);
  });

  it('negative: explicit manifest containing forbidden permission FAILS with non-zero exit code', () => {
    const tmpManifest = path.join(os.tmpdir(), 'test-forbidden-manifest-' + Date.now() + '.xml');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
</manifest>`;
    fs.writeFileSync(tmpManifest, xml, 'utf8');

    try {
      const res = spawnSync(process.execPath, [verifierScript, '--manifest', tmpManifest, '--compile-sdk', '36'], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });

      expect(res.status).not.toBe(0);
      const combined = (res.stdout || '') + (res.stderr || '');
      expect(combined).toContain('RECORD_AUDIO');
      expect(combined).toContain('VERIFICATION FAILED');
    } finally {
      try {
        fs.unlinkSync(tmpManifest);
      } catch {}
    }
  });

  it('negative: explicit manifest missing required CAMERA permission FAILS with non-zero exit code', () => {
    const tmpManifest = path.join(os.tmpdir(), 'test-missing-camera-manifest-' + Date.now() + '.xml');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>`;
    fs.writeFileSync(tmpManifest, xml, 'utf8');

    try {
      const res = spawnSync(process.execPath, [verifierScript, '--manifest', tmpManifest, '--compile-sdk', '36'], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });

      expect(res.status).not.toBe(0);
      const combined = (res.stdout || '') + (res.stderr || '');
      expect(combined).toContain('Required permission ABSENT');
      expect(combined).toContain('CAMERA');
    } finally {
      try {
        fs.unlinkSync(tmpManifest);
      } catch {}
    }
  });

  it('negative: explicit manifest with unproven compileSdk FAILS with non-zero exit code', () => {
    const tmpManifest = path.join(os.tmpdir(), 'test-no-compilesdk-manifest-' + Date.now() + '.xml');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.CAMERA" />
</manifest>`;
    fs.writeFileSync(tmpManifest, xml, 'utf8');

    try {
      // Running without --compile-sdk when manifest lacks android:compileSdkVersion
      const res = spawnSync(process.execPath, [verifierScript, '--manifest', tmpManifest], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });

      expect(res.status).not.toBe(0);
      const combined = (res.stdout || '') + (res.stderr || '');
      expect(combined).toMatch(/compilesdk/i);
    } finally {
      try {
        fs.unlinkSync(tmpManifest);
      } catch {}
    }
  });

  it('positive: valid explicit release manifest with explicit compileSdk PASSES with exit code 0', () => {
    const tmpManifest = path.join(os.tmpdir(), 'test-valid-manifest-' + Date.now() + '.xml');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.totsrl.getflo">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.INTERNET" />
    <!-- Comments with fake permissions must be ignored -->
    <!-- <uses-permission android:name="android.permission.RECORD_AUDIO" /> -->
</manifest>`;
    fs.writeFileSync(tmpManifest, xml, 'utf8');

    try {
      const res = spawnSync(process.execPath, [verifierScript, '--manifest', tmpManifest, '--compile-sdk', '36'], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });

      expect(res.status).toBe(0);
      const combined = (res.stdout || '') + (res.stderr || '');
      expect(combined).toContain('POLICY: PASS');
      expect(combined).toContain('ACTIVE PERMISSIONS: 2');
      expect(combined).toContain('✅ ABSENT : android.permission.RECORD_AUDIO');
      expect(combined).not.toContain('❌ PRESENT: android.permission.RECORD_AUDIO');
    } finally {
      try {
        fs.unlinkSync(tmpManifest);
      } catch {}
    }
  });

  it('integration regression: poisoned stale temp directories are NEVER discovered or used', () => {
    const poisonedDir = path.join(os.tmpdir(), 'getflow-prebuild-1111111111111');
    const poisonedManifestDir = path.join(
      poisonedDir,
      'android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest'
    );
    fs.mkdirSync(poisonedManifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(poisonedManifestDir, 'AndroidManifest.xml'),
      '<manifest package="poisoned.stale.package"></manifest>',
      'utf8'
    );

    try {
      const { resolveManifestInput, runDisposableReleaseManifestMerge } = require('../scripts/verifyAndroidReleasePermissions');
      // In default mode, resolveManifestInput MUST return null, never the poisoned directory
      const resolution = resolveManifestInput({});
      expect(resolution).toBeNull();

      // When running fresh disposable build, it uses its own timestamped directory
      let runWorkspace: string | null = null;
      const res = runDisposableReleaseManifestMerge({
        projectRoot: path.resolve(__dirname, '..'),
        execOverride: (cmd: string, opts: { cwd: string }) => {
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
          runWorkspace = dir;
        },
      });

      expect(runWorkspace).toBeTruthy();
      expect(runWorkspace).not.toContain('1111111111111');
      expect(res.manifestContent).toContain('com.totsrl.getflo');
      expect(res.manifestContent).not.toContain('poisoned.stale.package');
    } finally {
      try {
        fs.rmSync(poisonedDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('integration regression: verifier succeeds independently of local /android (clean checkout proof)', () => {
    // Verifier must generate its native tree in disposable workspace without reading local /android
    const fakeCleanProject = path.join(os.tmpdir(), 'clean-checkout-' + Date.now());
    fs.mkdirSync(fakeCleanProject, { recursive: true });
    fs.writeFileSync(
      path.join(fakeCleanProject, 'package.json'),
      JSON.stringify({ name: 'clean-app', version: '1.0.0' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(fakeCleanProject, 'package-lock.json'),
      JSON.stringify({ name: 'clean-app', version: '1.0.0', lockfileVersion: 3, packages: {} }),
      'utf8'
    );
    // Explicitly NO /android in fakeCleanProject
    expect(fs.existsSync(path.join(fakeCleanProject, 'android'))).toBe(false);

    try {
      const { runDisposableReleaseManifestMerge } = require('../scripts/verifyAndroidReleasePermissions');
      let createdDir: string | null = null;
      const res = runDisposableReleaseManifestMerge({
        projectRoot: fakeCleanProject,
        execOverride: (cmd: string, opts: { cwd: string }) => {
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
      if (createdDir) {
        expect(fs.existsSync(createdDir)).toBe(false); // Cleaned up in finally
      }
    } finally {
      try {
        fs.rmSync(fakeCleanProject, { recursive: true, force: true });
      } catch {}
    }
  });
});

