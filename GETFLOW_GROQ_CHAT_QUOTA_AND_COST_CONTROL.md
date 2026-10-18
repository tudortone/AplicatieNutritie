# GETFLOW — GROQ CHAT QUOTA & COST PROTECTION SPECIFICATION

**Status:** IMPLEMENTED, CONTRACT-AUDITED & TESTED  
**Target Environment:** Node.js Backend / React Native Frontend / Groq AI  
**Key Routes:** `POST /api/chat`, `POST /api/log-food-from-chat`, `GET /api/chat/quota`  
**OpenAPI Endpoints:** `/api/chat/quota`, `/api/v1/chat/quota`  

---

## 1. Context & Motivation

Prior to this implementation, a critical defect existed in the backend AI routing:
- The AI chat endpoint (`/api/chat`) invoked `consuma_credit` RPC—the exact same database function used to debit Photo AI credits.
- Consequently, asking a simple nutritional coaching question in Chat consumed one of the user's valuable 3 daily photo meal scans!
- Furthermore, there was no server-authoritative rate limiting or message ceiling on the Chat endpoint, exposing the application to unbounded Groq API provider costs if a client looped or flooded the service.

---

## 2. Architectural Design & Implementation

### 2.1 Chat Quota Service (`backend-nutritie-ai/utils/chatQuota.js`)
We introduced a dedicated, memory-efficient in-process and Redis-compatible quota tracker with atomic reservation and rollback semantics:
- **Default Tier Allowances:**
  - `free`: 10 messages / 24 hours (provisional starting Free plan as specified).
  - `premium`: 150 messages / 24 hours.
  - `tester`: 500 messages / 24 hours.
  - `admin`: Unlimited (`Infinity`).
- **Configurable Window:** 24-hour sliding window (`FEREASTRA_MS_IMPLICITA = 24 * 60 * 60 * 1000`).
- **Atomic Reservation & Rollback Contract:**
  1. `rezervaCotaChat(userId, rol)`: Checks current count. If `count >= limit`, immediately rejects with HTTP 429 and quota metadata. If within quota, increments count atomically and returns `{ ramase, limita, resetMs, tokenRezervare }`.
  2. `anuleazaRezervareCotaChat(userId, tokenRezervare)`: In the event of an upstream provider failure (Groq 429, 500, network timeout, or client disconnect), the reservation is automatically rolled back. The user is **never penalized** for a failed request.
  3. `confirmaCotaChat(userId, tokenRezervare)`: On successful completion and streaming of the Groq response, the reservation is committed.

### 2.2 Response Headers & Metadata
Every `/chat` and `/log-food-from-chat` response emits RFC-compliant quota headers:
- `X-ChatQuota-Limit`: Total daily quota for user's tier.
- `X-ChatQuota-Remaining`: Remaining messages available in the current window.
- `X-ChatQuota-Reset`: Milliseconds until the quota window resets.

### 2.3 Quota Inquiry Route (`GET /api/chat/quota`)
- Returns the current user's quota status without consuming an allowance:
  ```json
  {
    "ok": true,
    "cota": {
      "ramase": 7,
      "limita": 10,
      "utilizate": 3,
      "resetMs": 54200000,
      "resetDate": "2026-10-19T06:00:00.000Z",
      "status": "activ"
    }
  }
  ```
- Declared in `contracts/openapi.yaml` with both `/api/chat/quota` and `/api/v1/chat/quota` alias paths, fully passing `backend-nutritie-ai/tests/openapi_contract.test.js`.

---

## 3. Frontend Chat UI Integration (`frontend-nutritie/app/(tabs)/chat.tsx`)

### 3.1 Unobtrusive Quota Counter
- Renders a sleek, minimalist chip below the coach header:
  - TestID: `chat-quota-chip`
  - Display format: `"7 / 10 mesaje astăzi"` (or `"Premium • Nelimitat"` for subscribers).
  - Color palette: Subtle slate text (`#8E8E93`) with emerald accents when active, transitioning to amber when ≤ 2 messages remain.

### 3.2 Quota Exhaustion Handling
- When remaining count reaches 0:
  - TestID: `chat-quota-exhausted-banner`
  - Informative banner: *"Ai atins limita zilnică de 10 mesaje gratuite. Cota se resetează mâine la 06:00."*
  - Send button is cleanly disabled (`disabled={isSending || quotaRemaining === 0}`).
  - Chat history remains fully readable and scrollable; no blocking paywalls or intrusive interruptions.
  - Optional unobtrusive link to Premium info: *"Treci la Premium pentru acces extins."*

### 3.3 Defense Against Client Clock Tampering
- Quota is strictly server-authoritative. The client receives `resetMs` and remaining counts directly from backend response headers and `/api/chat/quota`. Modifying device system time has zero effect on the server's tracking ledger.

---

## 4. Test Verification Matrix

| Test Suite | Scope | Result |
| :--- | :--- | :--- |
| `backend-nutritie-ai/tests/chat_quota.test.js` | Unit: Free tier 10-msg limit enforcement | **PASS** |
| `backend-nutritie-ai/tests/chat_quota.test.js` | Unit: Atomic rollback on Groq failure | **PASS** |
| `backend-nutritie-ai/tests/chat_quota.test.js` | Unit: Premium tier (150 msg) allocation | **PASS** |
| `backend-nutritie-ai/tests/chat_quota.test.js` | Unit: Concurrent request handling | **PASS** |
| `backend-nutritie-ai/tests/chat_quota.test.js` | Integration: GET `/api/chat/quota` | **PASS** |
| `backend-nutritie-ai/tests/openapi_contract.test.js` | Contract: OpenAPI spec parity | **PASS** |
| `frontend-nutritie/__tests__/coachUiRedesign.test.tsx` | UI: Chat rendering & defensive header parsing | **PASS** |
| `frontend-nutritie/__tests__/p102ChatOfflineFalseSuccess.test.tsx` | E2E: Chat offline & failure recovery | **PASS** |

---

## 5. Owner Policy Approval Recommendation
- **Current Authorization:** Starting Free plan limit set to **10 successful messages per day**.
- **Action Required by Owner:** Confirm whether 10 msgs/day is the desired final commercial limit for the Google Play production release or if it should be adjusted (e.g. to 15 or 20) prior to general availability.
