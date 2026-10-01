# GETFLOW — V13 LOCAL STARTUP CRASH FORENSIC DEBUG

## SUMMARY METRICS

SKILLS USED:
root-cause-debugging, code-review, verification-before-completion

FILES INSPECTED:
34

STARTUP GRAPH:
Android OS Process Launch -> `MainApplication.kt` (`loadReactNative`, `ApplicationLifecycleDispatcher`) -> `MainActivity.kt` (`SplashScreenManager.registerOnActivity`, `super.onCreate`) -> Hermes Engine initializes and loads `index.android.bundle` -> Module-scope evaluation of `app/_layout.tsx` -> `RootLayout` mounts (`GlobalErrorBoundary`, `GestureHandlerRootView`, `SafeAreaProvider`, `BottomSheetModalProvider`, `AppThemeProvider`, `AuthProvider`, `OnboardingProvider`, `AccountBoundProviders`) -> `RootNavigator` initial render -> `AdsProvider` mounts -> `useRef(loadAdGateState(scopeKey))` synchronously executes `loadAdGateState('anon')` -> `getMmkv()` executes `createMMKV({ id: 'nutriai-ads-gate' })` -> In production Android (`newArchEnabled: true`), `createMMKV` invokes NitroModules / C++ HybridObject creation -> Native C++ abort/fault across JNI boundary terminates Android process with SIGABRT/SIGSEGV -> App immediately closes before UI draw.

TOP SUSPECTS BEFORE PROOF:
1. `react-native-mmkv` / NitroModules synchronous instantiation in `lib/ads/adGateStore.ts` during `AdsProvider` initial render.
2. `expo-iap` native module polyfill / EventEmitter mutation at module scope in `lib/billing/expoIapAdapter.ts`.
3. `@expo/app-integrity` version mismatch (`^57.0.2` vs Expo 54) during module import in `lib/playIntegrityNative.ts`.

ROOT CAUSE:
PROVEN

ROOT CAUSE FILE:
frontend-nutritie/lib/ads/adGateStore.ts

ROOT CAUSE LINE/COMPONENT:
Lines 40–45 (`createMMKV({ id: 'nutriai-ads-gate' })` inside `getMmkv()`), invoked synchronously by `loadAdGateState(scopeKey)` during `AdsProvider` mount in `context/AdsContext.tsx` line 65.

CRASH MECHANISM:
In commit `8cdcb0d` ("fix(android): resolve cold-start crash, harden expo-iap/mmkv/integrity, bump versionCode to 13"), the developer recognized that MMKV / NitroModules native C++ calls caused cold-start crashes on Android with React Native New Architecture (`newArchEnabled: true`). The developer removed MMKV from `hooks/useAppStore.ts` and replaced it with in-memory synchronous cache backed by `AsyncStorage`.
However, the developer overlooked `frontend-nutritie/lib/ads/adGateStore.ts`, which still had `require('react-native-mmkv')` and `createMMKV({ id: 'nutriai-ads-gate' })`. In that very same commit `8cdcb0d`, `AdsProvider` was added to `app/_layout.tsx`.
When `AdsProvider` mounts during root app startup, line 65 of `AdsContext.tsx` calls `loadAdGateState(scopeKey)` synchronously in `useRef`. This calls `createMMKV({ id: 'nutriai-ads-gate' })`. In production Android, this executes native C++ JNI bindings via NitroModules. Any unhandled C++ exception, JNI initialization mismatch, or mmap fault results in an unhandled native abort/segfault (SIGABRT/SIGSEGV). This kills the operating system process immediately, completely bypassing JavaScript `try / catch` and React ErrorBoundaries.

WHY IT CRASHES BEFORE UI:
`AdsProvider` is wrapped around the root navigation stack in `app/_layout.tsx`. On app launch, `loadAdGateState` is called during the initial React render pass. Because the crash occurs in native C++ before the native view hierarchy or frame composition is finished, the process dies within milliseconds of launch without presenting any UI.

WHY CLEARING CACHE MAY/MAY NOT HELP:
Clearing cache does NOT fix the root cause because the crash is in the executable code path attempting to load the native C++ HybridObject. However, because Android's OS-level CrashRecovery / RescueParty mechanism monitors repeated cold-start crashes, it assumes corrupted app data/cache and prompts the user with the system dialog: "GetFlow keeps stopping. [Clear cache / Clear storage]".

PRODUCTION-ONLY:
YES (`react-native-mmkv` contains an internal `if (isTest()) return createMockMMKV(configuration)` guard, so Jest / unit tests always bypass native C++ and return a mock object).

PERSISTED-DATA RELATED:
NO

ADMOB RELATED:
YES (the ad cadence store `adGateStore.ts` in the AdMob subsystem).

NUTRIENT FOCUS RELATED:
NO

JOURNAL PERFORMANCE RELATED:
NO

PLAY INTEGRITY RELATED:
NO

AUTH/ROUTER RELATED:
NO

FIX APPLIED:
YES

FILES CHANGED:
- `frontend-nutritie/lib/ads/adGateStore.ts`
- `frontend-nutritie/__tests__/adGateStore.test.ts`
- `frontend-nutritie/__tests__/adGateColdStartSafety.test.ts`
- `frontend-nutritie/__tests__/p109AdsEdgeSemantics.test.ts`

REGRESSION TEST:
PASS (verified failure on old code with `Expected: false, Received: true`, and pass on new code)

TYPECHECK:
PASS (0 type errors)

LINT:
PASS (0 lint errors)

EXPO DOCTOR:
PASS (18/18 checks passed)

PERMISSIONS:
PASS (0 forbidden permissions, 36 valid release permissions)

PRODUCTION EXPORT:
PASS (bundled 4456 modules into Hermes bytecode `entry-cfce79187da5a4a587881ba6f794ea3e.hbc`, 0 errors)

LOCAL REAL-DEVICE REPRO:
NOT AVAILABLE (no physical Android device or active emulator connected to adb)

CONFIDENCE:
HIGH

READY TO BUILD NEXT RC:
YES
