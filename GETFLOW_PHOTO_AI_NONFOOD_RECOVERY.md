# GETFLOW PHOTO AI NON-FOOD ERROR RECOVERY

**Target Platform:** Android 16 (SDK 36)  
**Target Hardware:** Samsung Galaxy S24 Ultra (`R5CX120W81K`)  
**Package:** `com.totsrl.getflo`  
**Components Modified:** `backend-nutritie-ai/src/trigger/analiza-mancare-ai.js`, `frontend-nutritie/app/camera.tsx`

---

## 1. Problem Description

When a user photographed or selected an image from the gallery that did not contain any food (such as a laptop, desk, pet, or landscape), the app exhibited critical UX defects:
1. The backend crashed during response normalization and returned a generic internal error (`Error`), rather than recognizing the image as non-food.
2. The user's reserved Flow Credit was not cleanly refunded or was marked as consumed/errored.
3. The frontend entered an unrecoverable state where technical error banners were shown without an intuitive exit path, trapping the user in the camera viewfinder with no shutter controls or with draft resumption alerts looping indefinitely.

---

## 2. Root Cause Analysis

### Backend (`analiza-mancare-ai.js`):
1. Gemini responds to non-food photos by either outputting an empty array `[]` or descriptions indicating no edible items were found.
2. `analiza-mancare-ai.js` passed `items` into `normalizePhotoItems(items)` **before** checking if food was detected.
3. `normalizePhotoItems` requires non-empty arrays with valid food numbers. Given `[]`, it threw `new Error('PHOTO_RESULT_INVALID')`.
4. The error was caught in the general `catch` block. The sanitization function `codEroareSigur(err)` used `err?.code || err?.name || 'ANALIZA_ESUATA'`. For a standard JS `Error`, `err.code` is undefined and `err.name` is `'Error'`, so the job was recorded with error code `'Error'`.
5. Because the error code was not `'NOT_FOOD'`, credit settlement logic didn't release the credit with the correct operational reason.

### Frontend (`camera.tsx`):
1. In `frontend-nutritie/app/camera.tsx`, the error handler only looked for `error.code === 'NOT_FOOD'` or `'PHOTO_RESULT_EMPTY'`.
2. When the backend returned `'Error'`, the specialized `camera-not-food-card` was never rendered.
3. If the user dismissed the camera or pressed back, the local image draft remained in cache, triggering a popup prompt on every subsequent camera open asking if they wanted to re-analyze the failed non-food photo.

---

## 3. Implementation Fixes

### A. Backend Trigger Task (`analiza-mancare-ai.js`):
```javascript
// Pre-normalization detection of non-food responses:
const isNotFood = items.length === 0 || items.some((item) =>
  !item || typeof item !== 'object' || /nu.*(mancare|aliment)|non-food|nu s-a detectat|nu contine|not.*food|no.*food/i.test(String(item.nume || ''))
);

if (isNotFood) {
  const rezultatNotFood = {
    success: false,
    isNotFood: true,
    eroare: 'Imaginea încărcată nu pare să conțină alimente. Te rugăm să încerci cu o poză clară a unei mese.',
    processedAt: new Date().toISOString(),
  };
  // Release reserved credits immediately
  await settlePhotoCredit({ userId, reservationId, action: 'release', reason: 'NOT_FOOD' });
  if (jobId) await updateAiJob(jobId, {
    status: 'failed', result: rezultatNotFood, error_code: 'NOT_FOOD',
  }, userId);
  return rezultatNotFood;
}
```

In addition, `codEroareSigur` was fortified to ensure generic `'Error'` strings are never emitted:
```javascript
const cleanName = err?.name && err?.name !== 'Error' ? err.name : null;
return err?.code || cleanName || 'ANALIZA_ESUATA';
```

### B. Frontend Viewfinder Recovery (`camera.tsx`):
1. **Error Code Broadening:** Extended non-food detection to recognize `NOT_FOOD`, `NO_FOOD`, `PHOTO_RESULT_EMPTY`, `EMPTY_RESULT`, `PHOTO_RESULT_INVALID`, and payloads with `isNotFood: true`.
2. **Dedicated Recovery Card:** The `camera-not-food-card` provides clear copy informing the user that no food was detected and gives three unambiguous action buttons:
   - **"Refă fotografia" (Retake photo):** Clears failure state, camera resumes viewfinder streaming.
   - **"Alege din galerie" (Choose from gallery):** Clears failure state and immediately launches the image picker.
   - **"Mergi la Acasă" (Go to Home):** Clears draft and smoothly navigates back to Home.
3. **Control Isolation:** During the non-food state, the live shutter and background camera streaming are suspended (`active={false}`) to save battery and GPU cycles.
4. **Draft Purge:** If the user cancels or discards an invalid draft, `purgeLocalImageDrafts` clears orphaned files so resumption alerts never loop.

---

## 4. Verification Evidence

- `backend-nutritie-ai/tests/trigger_photo_contract.test.js`:
  - `codEroareSigur cleanly categorizes high demand, rate limit, and never returns generic Error`: **PASS**
  - All 8 trigger photo contract tests: **PASS**
- `frontend-nutritie/__tests__/p116CameraAndKeyboardRegression.test.tsx`:
  - `verifies non-food recovery card contracts and error code handling in camera source`: **PASS**
  - All 9 regression tests: **PASS**

**Status: VERIFIED & PASS**
