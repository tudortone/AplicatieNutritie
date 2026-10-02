# GetFlow Anatomy V2 legal audit

Audit date: 2026-09-27  
Scope: Workout / Anatomy V2 preview only  
Chosen version: `react-native-body-parts-anatomy@1.2.0`

## Decision

**LEGAL SOURCE AUDIT: PASS**

The preferred source is accepted for the commercial GetFlow preview. The
published package declares MIT licensing, includes its own copyright notice,
and bundles a third-party notice that identifies the anatomical path-data
derivation from `react-native-body-highlighter@3.2.0`. That upstream source is
also MIT licensed. MIT explicitly permits use, modification, distribution,
sublicensing, and sale when the copyright and permission notices are retained.

This is a source-license and repository-provenance audit, not legal advice or
an independent proof of authorship beyond the licensors' published notices.

| Item | Result |
| --- | --- |
| Package code license | MIT — Copyright (c) 2026 Eslam Elfateh |
| Embedded anatomy paths | Derived from `react-native-body-highlighter@3.2.0` |
| Embedded source license | MIT — Copyright (c) 2022 ELABBASSI Hicham |
| Commercial use | Permitted by both MIT grants |
| Attribution/notices | Required; preserved in `THIRD_PARTY_NOTICES.md` |
| Share-alike/copyleft | None |
| Separate non-MIT anatomy license | None declared in the audited package |
| Fallback required | No |

Primary evidence:

- https://github.com/eslamelfateh/react-native-body-parts-anatomy/blob/main/LICENSE
- https://github.com/eslamelfateh/react-native-body-parts-anatomy/blob/main/THIRD_PARTY_NOTICES.md
- https://github.com/eslamelfateh/react-native-body-parts-anatomy/blob/main/package.json
- https://github.com/HichamELBSI/react-native-body-highlighter/blob/v3.2.0/LICENSE

## Reproducibility

- `frontend-nutritie/package.json` pins version `1.2.0` without a range.
- `frontend-nutritie/package-lock.json` records the exact registry tarball and
  integrity value
  `sha512-Jar7JLWviGXyIC2WvAxhFurzrsuvTd8ys69SxyZvUobk+Pb5+EBw1HIWJK7OfogYqQaaCEGUpdlr2mVARQCYIA==`.
- The installed tarball was inspected locally: it contains both `LICENSE` and
  `THIRD_PARTY_NOTICES.md` with the notices described above.

## Imported or adapted files

No third-party SVG or path file was copied into the GetFlow repository.

- Runtime import: `BodySilhouette`, types, group slugs, and fragment lookup
  metadata from the pinned npm package.
- GetFlow adapter:
  `frontend-nutritie/components/workout-v2/anatomyV2SourceAdapter.ts`.
- GetFlow visual wrapper:
  `frontend-nutritie/components/workout-v2/AnatomyV2Map.tsx`.
- Transformation of anatomy paths by GetFlow: **none**.
- Proprietary/Liftoff/OpenStax artwork incorporated: **none**.

## Canonical mapping and honest limitations

The adapter preserves all 19 canonical IDs in workout/scoring data. It maps
only source regions genuinely present in the audited geometry:

- source `chest` aggregates GetFlow `chest` and `upper_chest`;
- source front `deltoids` aggregates `front_delts` and `side_delts`;
- source back `deltoids` aggregates `rear_delts` and `side_delts`;
- source `upper-back` represents GetFlow `lats` at the source's available
  coarse granularity;
- all other mapped regions use the directly corresponding published group;
- `hip_flexors` remains a valid domain/scoring ID but has no visual source
  region because the package does not provide distinct hip-flexor geometry.

No artificial SVG boundary was created for upper chest, deltoid subdivisions,
or hip flexors. When an aggregated source region receives multiple GetFlow
states, the deterministic display rule is: primary over secondary over
stabilizer; strength uses the highest available score before applying the
unchanged five-level function.

## Isolation and domain boundary

- Integration exists only under `components/workout-v2` and the already gated
  `workout-v2-preview` route.
- Production `components/fitness/BodyMap.tsx` was not modified by this task.
- Exercise-to-muscle mapping, Strength Map, Flow Rank, Momentum, templates,
  presets, session handling, persistence, and scoring formulas were not
  modified.
- No AAB was built.

## Validation record

Final commands and screenshot paths are recorded after verification in this
document's completion section.

### Completion

**IMPLEMENTATION AND AUTOMATED GATE: PASS**

- Runtime used for the final gate: Node `v22.23.3`.
- Focused Workout/Anatomy V2 plus locale parity: **21 suites / 71 tests
  passed**.
- `scripts/verifyAnatomyV2.mjs`: **PASS** — audited package `1.2.0`, published
  front/back anatomy, all 19 canonical IDs accounted for, production isolated.
- TypeScript (`tsc --noEmit`): **PASS**.
- Expo lint: **PASS with 0 errors and 23 pre-existing warnings** outside the
  Anatomy V2 replacement (`app/_layout.tsx` and
  `components/ui/AppSplashScreen.tsx`).
- AAB: **NOT RUN**.

Visual QA was captured at a 390 x 844 mobile viewport from the real
`AnatomyV2VisualQA` and `AnatomyV2Map` components. A temporary, non-product
mounting harness was used because the full Expo web root currently fails in an
unrelated `AdsProvider` initialization before any route can mount. The harness
source was removed after capture; only the evidence images remain.

Screenshot evidence:

- `frontend-nutritie/output/playwright/anatomy-v2/front-neutral.png`
- `frontend-nutritie/output/playwright/anatomy-v2/back-neutral.png`
- `frontend-nutritie/output/playwright/anatomy-v2/front-exercise-highlight.png`
- `frontend-nutritie/output/playwright/anatomy-v2/back-exercise-highlight.png`
- `frontend-nutritie/output/playwright/anatomy-v2/strength-level-1.png`
- `frontend-nutritie/output/playwright/anatomy-v2/strength-level-3.png`
- `frontend-nutritie/output/playwright/anatomy-v2/strength-level-5.png`
- `frontend-nutritie/output/playwright/anatomy-v2/muscle-detail-interaction.png`
- `frontend-nutritie/output/playwright/anatomy-v2/full-workout-influence.png`

The web package documents rendering support but not pointer selection on web.
Accordingly, the detail screenshot uses the deterministic preview state; the
selection callback and canonical adapter contract are covered by focused
component tests. Native device interaction remains part of the later preview
validation and does not enable V2 in production.
