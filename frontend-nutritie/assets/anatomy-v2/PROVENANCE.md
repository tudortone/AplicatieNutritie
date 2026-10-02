# GetFlow Anatomy V2 provenance

## Active preview source

The isolated Workout V2 preview renders `react-native-body-parts-anatomy`
version `1.2.0`, installed from npm and pinned exactly in `package.json` and
`package-lock.json`.

- npm package: `react-native-body-parts-anatomy@1.2.0`
- repository: https://github.com/eslamelfateh/react-native-body-parts-anatomy
- package tarball integrity recorded by npm:
  `sha512-Jar7JLWviGXyIC2WvAxhFurzrsuvTd8ys69SxyZvUobk+Pb5+EBw1HIWJK7OfogYqQaaCEGUpdlr2mVARQCYIA==`
- package license: MIT, Copyright (c) 2026 Eslam Elfateh
- embedded anatomical path source: derived by that package from
  `react-native-body-highlighter@3.2.0`, MIT, Copyright (c) 2022 ELABBASSI
  Hicham, as declared in the package's bundled `THIRD_PARTY_NOTICES.md`.

GetFlow does not copy, vendor, trace, or transform the package's SVG path
data. `components/workout-v2/AnatomyV2Map.tsx` renders the published
`BodySilhouette` component directly. The GetFlow-owned
`anatomyV2SourceAdapter.ts` maps published muscle-group slugs to existing
GetFlow canonical IDs and contains no third-party path data.

The source provides no distinct boundaries for upper chest or the three
GetFlow deltoid subdivisions. Those states are therefore aggregated over the
source chest/deltoid regions. It provides no distinct hip-flexor geometry, so
GetFlow deliberately leaves `hip_flexors` without a visual region rather than
mislabeling another muscle.

Full notices are preserved in the repository root `THIRD_PARTY_NOTICES.md`.

## Superseded GetFlow-authored preview draft

The local `front.svg` and `back.svg` files are the original geometric GetFlow
draft created on 2026-09-26. They are retained only as historical, unused
preview source for the existing generator/verifier. They are no longer
imported by `AnatomyV2Map` and are not the active Workout V2 visual model.

No Liftoff artwork, proprietary application artwork, screenshot, OpenStax
asset, production `assets/anatomy/fata.svg` / `spate.svg` path, or other
third-party visual was copied into GetFlow.
