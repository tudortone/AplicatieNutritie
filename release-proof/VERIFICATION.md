# Focused release verification — 24 October 2026

Base: `751461f7f6fd726019b90215c14e4e3eadccbb30`. Branch: `codex/launch-closure-20261024`.
Node 22.23.3. Private dependencies reused; no package installation, cloud build or provider inference.

| Check | Actual result | Exit |
|---|---|---|
| Frontend update service, update notice and real root routing | 3 suites, 31 tests PASS; `frontend-update.json` | 0 |
| Backend version policy + critical existing Photo/reward/Billing/GDPR/chat regressions | 13 suites, 103 tests PASS; `backend-critical.json` | 0 |
| Frontend TypeScript | `tsc --noEmit`; `typecheck.json` | 0 |
| Canonical Expo lint, seven affected TS/TSX paths | 0 errors, 0 warnings | 0 |
| Backend ESLint, version route and two version test files | 0 errors, 0 warnings | 0 |
| `git diff --check` | no whitespace errors | 0 |
| APK public certificate verification, JDK17 + Android build-tools36 apksigner | signature valid; SHA-256 e4336e887a1b7f384382509b96fbbb98c4db87715e313e64fd3379e23194fea4 | 0 |

TDD evidence: commits `6076ec7bc056d7546eb9376682e96347628e0178` and `aa22ff059567fed3711ea39c2678b6adf3ca59fa` precede implementation. Historical Gemini service failed 11/12 executed frontend tests; backend policy failed 9/10 (both exit1). The UI regression first failed because its consumer did not exist. Later RNTL14 async-event fixture errors and root SafeArea mocks were corrected; final JSON files contain the successful rerun. No assertions were removed to obtain PASS. The explicit backend min32 fixture now also sets latest32, preserving its intended coherent override.

Frontend command: `node node_modules/jest/bin/jest.js --runInBand --no-cache --cacheDirectory ../.closure-jest --json --outputFile ../release-proof/frontend-update.json --runTestsByPath __tests__/versionCheck.test.ts __tests__/appUpdateNotice.test.tsx __tests__/oauthRootRouting.test.tsx`.

Backend command: same Jest entrypoint, `--runInBand --no-cache --json --outputFile ../release-proof/backend-critical.json`, with paths recorded in that JSON. Supertest required sandbox elevation for local loopback; all external service dependencies in those tests are fixtures/mocks.

Canonical frontend lint: `node node_modules/expo/bin/cli lint --no-cache app/_layout.tsx lib/versionCheck.ts hooks/useAppUpdate.ts components/AppUpdateNotice.tsx __tests__/versionCheck.test.ts __tests__/appUpdateNotice.test.tsx __tests__/oauthRootRouting.test.tsx`. EXPO_NO_DOTENV=1, EXPO_OFFLINE=1, EXPO_PUBLIC_APP_ENV=test. This is focused lint, not a claim that all historical warnings disappeared.

No current full frontend/backend count is asserted. Prior accepted suites and PostgreSQL rehearsal were not repeated. No physical, cloud, purchase, SSV-delivery, provider latency, Gradle, signing-key or Play-update PASS is inferred from local tests.

Dependency delta: promote already locked/installed expo-application7.0.8 to a direct Expo-compatible `~7.0.8` dependency. Resolved package records and all other dependency versions remain unchanged. Existing backend follow-redirects1.16.1/ip-address10.7.4 fixes preserved. No new registry audit in this execution.
