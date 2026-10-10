# GetFlow AI Coach → Journal Regression Report

## Final focused run

Runtime: Node `v22.23.3`

Command scope:

- `coachMealDraft.test.ts`
- `p102ChatOfflineFalseSuccess.test.tsx`
- `chatMealProposal.test.ts`
- `coachUiRedesign.test.tsx`
- `p105InternationalTesterCompleteness.test.ts`
- `i18n.test.ts`
- `tier1I18nBlockerSweep.test.ts`
- `coachRecipeLocaleMotion.test.ts`

Result: **8 suites passed, 121 tests passed, 0 failed.**

TypeScript (`tsc --noEmit`): **PASS**.

Frontend lint: **PASS, 0 errors**. One pre-existing `react-hooks/exhaustive-deps` warning remains in `components/ui/AppSplashScreen.tsx:151`; it is outside the Coach/Journal work.

## Behaviors covered

- Add action appears on each suggestion; opening it does not save.
- Cancel does not save.
- Romanian “Adaugă această masă în jurnal” resolves the latest suggestion without another AI request.
- Multiple suggestions retain independent actions; an ambiguous chat command asks the user to select a card.
- Missing nutrition remains missing and disables save until values are completed.
- Edited values persist as one user-owned Journal meal and notify Home/Journal refresh.
- Server failure retains the editable draft and shows no success state.
- Repeated confirm taps produce one insert; account change during a pending insert does not show success or refresh the new account.
- Suggestion strings resolve in RO, EN, FR, and DE.
- Structured recipe content remains readable and does not expose the raw proposal protocol.

## Release boundary

No AAB was built and no backend or Production deployment was performed. New localization and UI code requires a new Android app update before device users receive it. Physical-device verification is still pending.
