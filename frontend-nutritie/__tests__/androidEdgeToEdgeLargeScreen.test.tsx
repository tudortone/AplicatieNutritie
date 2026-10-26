/** @jest-environment-options {"customExportConditions":["node","node-addons"]} */
import { renderHook } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { AndroidConfig, type ExportedConfig } from 'expo/config-plugins';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

let mockWidth = 360;
let mockHeight = 800;
let mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: mockHeight, scale: 2, fontScale: 1 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

describe('Android 15/16 Edge-to-Edge & Large Screen Compatibility', () => {
  afterEach(() => {
    mockWidth = 360;
    mockHeight = 800;
    mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };
  });

  describe('Device Form Factor & Orientation Adaptations', () => {
    test('Phone Portrait (360x800) - Compact phone layout with safe insets', async () => {
      mockWidth = 360;
      mockHeight = 800;
      mockInsets = { top: 28, bottom: 24, left: 0, right: 0 };

      const hookResult = await renderHook(() => useResponsiveLayout());

      expect(hookResult.result.current.isTablet).toBe(false);
      expect(hookResult.result.current.isLandscape).toBe(false);
      expect(hookResult.result.current.isCompact).toBe(true);
      expect(hookResult.result.current.topInset).toBe(28);
      expect(hookResult.result.current.bottomInset).toBe(24);
      expect(hookResult.result.current.contentMaxWidth).toBe(520);
    });

    test('Phone Landscape (800x360) - Does NOT falsely classify as tablet, respects camera cutout on side', async () => {
      mockWidth = 800;
      mockHeight = 360;
      // Camera notch cutout on left side in landscape:
      mockInsets = { top: 0, bottom: 16, left: 36, right: 0 };

      const hookResult = await renderHook(() => useResponsiveLayout());

      expect(hookResult.result.current.isTablet).toBe(false);
      expect(hookResult.result.current.isLandscape).toBe(true);
      expect(hookResult.result.current.shortestDimension).toBe(360);
      // Horizontal padding adapts to the 36px cutout inset so UI does not sit under notch
      expect(hookResult.result.current.horizontalPadding).toBe(36);
      expect(hookResult.result.current.contentMaxWidth).toBe(600);
    });

    test('Tablet Portrait (800x1280) - Canonical sw600dp tablet classification', async () => {
      mockWidth = 800;
      mockHeight = 1280;
      mockInsets = { top: 32, bottom: 32, left: 0, right: 0 };

      const hookResult = await renderHook(() => useResponsiveLayout());

      expect(hookResult.result.current.isTablet).toBe(true);
      expect(hookResult.result.current.isLandscape).toBe(false);
      expect(hookResult.result.current.shortestDimension).toBe(800);
      expect(hookResult.result.current.horizontalPadding).toBe(28);
      expect(hookResult.result.current.contentMaxWidth).toBe(744); // 800 - 28*2
    });

    test('Tablet Landscape (1280x800) - Wide tablet presentation capped at 760px', async () => {
      mockWidth = 1280;
      mockHeight = 800;
      mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };

      const hookResult = await renderHook(() => useResponsiveLayout());

      expect(hookResult.result.current.isTablet).toBe(true);
      expect(hookResult.result.current.isLandscape).toBe(true);
      expect(hookResult.result.current.contentMaxWidth).toBe(760);
    });

    test('Foldable Narrow / Outer Screen (320x680) - Very compact layout', async () => {
      mockWidth = 320;
      mockHeight = 680;
      mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };

      const hookResult = await renderHook(() => useResponsiveLayout());

      expect(hookResult.result.current.isTablet).toBe(false);
      expect(hookResult.result.current.isVeryCompact).toBe(true);
      expect(hookResult.result.current.isCompact).toBe(true);
      expect(hookResult.result.current.horizontalPadding).toBe(14);
    });

    test('Foldable Unfolded / Inner Screen (768x900) - Expands to spacious card layout', async () => {
      mockWidth = 768;
      mockHeight = 900;
      mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };

      const hookResult = await renderHook(() => useResponsiveLayout());

      expect(hookResult.result.current.isTablet).toBe(true);
      expect(hookResult.result.current.isLargeScreen).toBe(true);
      expect(hookResult.result.current.contentMaxWidth).toBe(712); // 768 - 28*2
    });
  });

  describe('Static Manifest & Source Configuration Invariants', () => {
    test('app.json has orientation default and edgeToEdgeEnabled true', () => {
      const appJsonPath = path.resolve(__dirname, '../app.json');
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

      expect(appJson.expo.orientation).toBe('default');
      expect(appJson.expo.android.edgeToEdgeEnabled).toBe(true);
      expect(appJson.expo.android.softwareKeyboardLayoutMode).toBe('resize');
      expect(appJson.expo.plugins).toContain('./plugins/withAndroidResponsiveWindow');
    });

    test('managed manifest transforms emit a resizable MainActivity without a portrait lock', async () => {
      const withResponsiveWindow = jest.requireActual<(config: ExportedConfig) => ExportedConfig>('../plugins/withAndroidResponsiveWindow');
      const config = withResponsiveWindow({ name: 'GetFlow', slug: 'nutriai', orientation: 'default' });
      const transform = config.mods?.android?.manifest;
      if (!transform) throw new Error('Responsive manifest mod is not registered');
      const manifest: AndroidConfig.Manifest.AndroidManifest = { manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, queries: [],
        application: [{ $: { 'android:name': '.MainApplication' }, activity: [{ $: { 'android:name': '.MainActivity' } }] }],
      } };
      const result = await transform({ ...config, modRawConfig: config,
        modRequest: { projectRoot: __dirname, platformProjectRoot: __dirname, platform: 'android', modName: 'manifest', introspect: true },
        modResults: AndroidConfig.Orientation.setAndroidOrientation(config, manifest),
      });
      const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result.modResults);
      expect(activity.$['android:screenOrientation']).toBe('unspecified');
      expect(activity.$['android:resizeableActivity']).toBe('true');
      expect(result.modResults.manifest).toEqual(expect.objectContaining({
        'supports-screens': [{ $: { 'android:resizeable': 'true' } }],
      }));
    });

    test('managed style transform emits transparent system bars and short-edge cutout policy', async () => {
      const withResponsiveWindow = jest.requireActual<(config: ExportedConfig) => ExportedConfig>('../plugins/withAndroidResponsiveWindow');
      const config = withResponsiveWindow({ name: 'GetFlow', slug: 'nutriai' });
      const transform = config.mods?.android?.styles;
      if (!transform) throw new Error('Responsive styles mod is not registered');
      const result = await transform({ ...config, modRawConfig: config,
        modRequest: { projectRoot: __dirname, platformProjectRoot: __dirname, platform: 'android', modName: 'styles', introspect: true },
        modResults: { resources: { style: [{ $: { name: 'AppTheme', parent: 'Theme.AppCompat' }, item: [] }] } },
      });
      const items = result.modResults.resources.style?.[0].item;
      expect(items).toEqual(expect.arrayContaining([
        { $: { name: 'android:statusBarColor' }, _: '@android:color/transparent' },
        { $: { name: 'android:navigationBarColor' }, _: '@android:color/transparent' },
        { $: { name: 'android:windowLayoutInDisplayCutoutMode', 'tools:targetApi': '27' }, _: 'shortEdges' },
      ]));
    });

    test('Zero app-owned deprecated window API invocations in application source code', () => {
      const appDir = path.resolve(__dirname, '../app');
      const componentsDir = path.resolve(__dirname, '../components');
      const libDir = path.resolve(__dirname, '../lib');
      const hooksDir = path.resolve(__dirname, '../hooks');

      const dirs = [appDir, componentsDir, libDir, hooksDir];
      const deprecatedApis = [
        'setStatusBarColor',
        'setNavigationBarColor',
        'getNavigationBarColor',
        'LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES',
        'LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT',
      ];

      function scanDir(dir: string): string[] {
        let results: string[] = [];
        if (!fs.existsSync(dir)) return results;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(scanDir(fullPath));
          } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const api of deprecatedApis) {
              if (content.includes(api)) {
                results.push(`${fullPath}: ${api}`);
              }
            }
          }
        }
        return results;
      }

      const violations: string[] = [];
      for (const d of dirs) {
        violations.push(...scanDir(d));
      }

      expect(violations).toEqual([]);
    });
  });
});
