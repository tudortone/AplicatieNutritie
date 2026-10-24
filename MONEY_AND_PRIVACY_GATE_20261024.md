# Money, AI and privacy gate

24 October 2026. **PASS_LOCAL_ONLY; LIVE ACCEPTANCE PENDING.** Supabase Auth + expo-iap/Google Play API/RTDN, not Clerk/RevenueCat. Products/prices/economics unchanged.

Focused backend JSON:13 suites103 assertions/tests PASS exit0 including version tests; this is a combined selection, not103 distinct monetary tests. Test names/individual assertions are preserved in release-proof/backend-critical.json. No connected provider, real purchase, test purchase, reward impression or live GDPR deletion was invoked.

| Path | Local verified coverage / preserved design | Remaining acceptance |
|---|---|---|
|Photo AI|Atomic reservation before admission, durable logical operation fingerprint, replay/ownership rejection, result persistence then v2 settlement; ambiguous inference/commit stays held with durable reconciliation; confirmed failures release; completed result not replaced by late failure|Current Hosted RPCs/migrations absent at retained snapshot; actual Trigger version, paid provider success/failure, journal write and interrupted-device flow not demonstrated|
|Unknown outcomes|photo_outcome_ops/reconcile tests retain original held reservation, block original replay, require evidence for outcome resolution; distinct operation gets its own reservation/concurrency admission|Live backlog/age and scheduled reconciliation/alerts must be observed. No unknown historical job was refunded/replayed/cancelled|
|Chat|Per-user admission and shared Redis lease path tested, fail closed on shared-store unavailability; bounded provider calls/quota paths retained|Redis/current policy and actual provider latency/quota enforcement unverified; local fallback is not a multi-instance global limit|
|Rewarded|Cryptographic SSV verification rejects invalid/mutated callback binding; intent service idempotency and reward application fixture coverage|Actual AdMob test impression→verified SSV→one durable award and duplicate cross-user rejection on Hosted still pending|
|Integrity|Reward intent additionally requires trusted token/request binding independent of permissive global mode; no credit from unsigned client evidence|Verify Play clients before separately approved enforce rollout. Current global mode unknown; startup not blocked or modified|
|Billing|Server verifies token/package/product, owns entitlements; service/routes cover duplicate notifications, resync/restore/error paths|Authorised licensed-test purchases, renew/refund/revoke/RTDN delivery/ack recovery on actual Play build not performed|
|Privacy|GDPR recovery fixtures, tenant-bound job lookup, redacted operational codes retained; no PII added to proof files|Real synthetic-account export/delete and native logout/account isolation still pending; do not delete real users|

EU ordering inspected in AdsContext: resolve consent → canRequestAds → SDK initialise; account gate state keyed by user. This source order is not a current UMP/native acceptance result. No ad request or consent-setting mutation occurred.

Cost controls present in source: AI_MAX_CONCURENTA4, queue12; photo task default8; Chat global lease12 (shared only with verified Redis); provider cascade configurable cap default8, user/day quotas and premium fair use50. These are defaults, not confirmed live configuration. A value0 can mean unlimited cascade calls; reject that operational choice for a bounded canary. No environment change was applied.

**No durable global dollar-spend circuit breaker is demonstrated.** utils/metrics.js estimates token cost in process memory; it is not a cross-instance invoice ledger or enforceable budget. Existing rate/admission caps do not supply that guarantee. No automatic financial architecture was invented without a threshold/owner decision. Prepared stop plan: before any paid staging operation, owner chooses provider project/billing cap, alert threshold, total operation ceiling and one operator able to disable producer admission; enable verified provider hard cap where supported and confirm runtime stop behavior. If a hard cap/authorised manual stop cannot be established, do not start paid testing or advertise unrestricted availability. Outstanding launch risk until accepted and evidenced.

Monitor provider bills/usage alongside request/settlement IDs (no photo/user content), queue age, oldest held reservation, unreconciled outcomes, duplicate awards, verification failures and DB pool/locks. Confirm alert routing and operator acknowledgement before rollout. Retained estimated metrics and1750 synthetic HTTP requests are not actual production costs/capacity.

Performance in this execution: local Jest durations recorded in JSON, not endpoint/AI latency. No new cold/warm Render sample, provider/queue timing, n/p50/p95 or memory profile collected. Retained n40 loopback version endpoint p50=5.1473ms/p95=9.8259ms is synthetic Windows-only and cannot justify a Render plan change. Bounded staging latency tests need explicit accounts, request/cost ceiling and approved target; no Production load.

Release blockers: real backup/recovery, excess Hosted ACL remediation, DB-v2/worker/backend coordination, actual Play reward/Billing/Integrity acceptance, verified global spend-stop policy, final artifact device/privacy journeys. No double-charge/reward defect was demonstrated in the focused fixtures; that is not whole-system live certification.
