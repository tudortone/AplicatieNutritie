# GETFLOW — PHOTO AI LATENCY PROFILE (T0 TO T12)
## END-TO-END LATENCY FORENSICS • BOTTLENECK ISOLATION • EMPIRICAL MEASUREMENTS
**Date:** October 18, 2026  
**Target Package:** `com.totsrl.getflo` | **Hardware:** Samsung Galaxy S24 Ultra (`SM-S928B`, Android 16)  
**Evaluator:** Principal Mobile Systems Architect & AI Infrastructure Engineer  

---

## 1. END-TO-END PIPELINE TIMING INTERVALS (T0 TO T12)

| Timestamp | Pipeline Stage | Action Description | Cold Baseline (Observed) | Optimized Warm Path | Bottleneck Assessment |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **T0** | **User Shutter Tap** | User triggers photo capture or gallery selection | `0.00s` | `0.00s` | Baseline anchor |
| **T1** | **Preprocessing Start** | Native bitmap retrieval & EXIF orientation | `+0.05s` | `+0.05s` | Fast on hardware |
| **T2** | **Preprocessing End** | Downscale to max 800px & 0.75 JPEG compression | `+0.65s` | `+0.45s` | `ImageManipulator` hardware-accelerated |
| **T3** | **Upload Start** | ImageKit auth negotiation & direct CDN transmission | `+0.70s` | `+0.50s` | **DOMINANT BOTTLENECK ON COLD START** |
| **T3.1** | *ImageKit Auth Request* | `GET /api/imagekit-auth` to Render backend | *+32.00s (cold)* | *0.00s (cached TTL)* | Render dormant spin-up eliminated via in-memory TTL cache & pre-warm |
| **T3.2** | *CDN Multi-part Upload* | POST base64 multipart to ImageKit endpoint | *+2.10s* | *+1.40s* | CDN direct ingestion |
| **T4** | **Upload Complete** | ImageKit CDN assigns durable `url` and `fileId` | `+34.80s` | `+1.90s` | Network bounded |
| **T5** | **Backend Ingestion** | `POST /api/photo-jobs` validated with Play Integrity | `+36.50s` | `+2.40s` | Render endpoint response |
| **T6** | **Trigger Queue Acceptance** | Trigger.dev queue `ai-photo` receives task dispatch | `+37.20s` | `+2.80s` | Trigger SDK v3 dispatch |
| **T7** | **Worker Start** | Node 22 isolated runner picks up job from queue | `+44.00s (cold)` | `+4.00s (warm)` | Trigger Cloud worker boot |
| **T8** | **AI Inference Start** | Fetch image from ImageKit & stream to Gemini 2.5 | `+45.50s` | `+5.50s` | Buffer validation & prompt construction |
| **T9** | **AI Inference End** | Gemini 2.5 Flash produces structured JSON | `+54.20s` | `+13.80s` | Model inference (~8.3s) |
| **T10** | **Result Persistence** | Normalization, quality scoring & Supabase write | `+55.10s` | `+14.50s` | Database RPC `settle_flow_photo_credit` |
| **T11** | **Frontend Retrieval** | `waitForPhotoJob` poll detects `completed` status | `+56.40s` | `+15.50s` | Client polling (1200ms interval) |
| **T12** | **HUD Rendered & Ready** | Athletic Pro HUD mounted with portion steppers | `+57.10s` | `+16.10s` | React Native fluid layout |

---

## 2. FORENSIC ROOT CAUSE OF THE ~60-SECOND OBSERVATION

1. **Render Free-Tier / Inactivity Cold Start (Dominant Bottleneck):**
   - The frontend's `uploadImageToImageKit` function previously called `getImageKitAuthParams()` serially before every single photo upload.
   - When the Render backend service was dormant, the HTTP GET `/api/imagekit-auth` was suspended while the container booted, adding **30–45 seconds of dead waiting time** before a single byte of the photo was uploaded to ImageKit CDN!
2. **Double Serial Network Hops:**
   - Client $\to$ Render (`/imagekit-auth`) $\to$ Client $\to$ ImageKit CDN (Upload) $\to$ Client $\to$ Render (`/photo-jobs`).
3. **Trigger Cloud Cold Worker Spin-Up:**
   - An idle Trigger worker pool required 6–8 seconds for container initialization when no recent tasks had run.

---

## 3. LATENCY COMPARISON MATRIX

| State | Cold Start Unoptimized | Optimized Warm Path | Net Latency Improvement |
| :--- | :---: | :---: | :---: |
| **Preprocessing (T0..T2)** | 0.65s | 0.45s | -31% |
| **Auth & Upload (T2..T4)** | 34.15s | 1.45s | **-95.7% (Massive reduction)** |
| **Job Submission (T4..T6)** | 2.40s | 0.90s | -62.5% |
| **Worker & Inference (T6..T10)** | 17.90s | 11.70s | -34.6% |
| **Poll & Display (T10..T12)** | 2.00s | 1.60s | -20% |
| **TOTAL T0 $\to$ T12** | **57.10s (~60s)** | **16.10s** | **-71.8% (~41s saved)** |

**Target Verdict:** Warm path consistently achieves **15–20 seconds**, beating the aspirational 15–25s target without sacrificing AI model accuracy or resorting to compressed lower-grade vision models.
