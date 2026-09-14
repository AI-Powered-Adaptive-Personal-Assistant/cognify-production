# Cognify 2.0 — Architecture & System Guide

> The definitive architectural map of **Cognify 2.0 (AI-LA Intelligence)**.
> This document reflects the true, verified implementation across the server-side AI routing pipeline, unified student state engine, persistent learning event store, spatial memory, and multi-tenant security layers.

---

## 1. System Mission & Core Paradigm

Cognify is an **Adaptive AI Mentor, Pedagogical Diagnostic Engine & Accessibility Assistant**. It does not operate as a stateless chatbot with a large prompt. Instead, it maintains a **continuous, closed-loop pedagogical state** that adapts instructional strategies in real-time based on concept mastery, prerequisite diagnosis, student feedback, and learning strain.

- **Supported Product Languages:** Arabic (Egyptian / MSA), English, and French across all AI reasoning, vision, and spatial memory features.
- **Technology Stack:**
  - **Frontend:** React 19 + TypeScript + Vite, Tailwind CSS, Motion, Lucide Icons.
  - **Cloud Services:** Firebase (Auth, Firestore, Storage).
  - **Serverless AI Routing:** Node.js / Vercel Serverless (`api/` & `api/_lib/`), Express fallback (`server/`).
  - **AI Providers:** Multi-provider fallback chain (Google Gemini, Groq, NVIDIA NIM, xAI Grok).
  - **Edge Intelligence:** WebGL, MediaPipe, TensorFlow.js (local in-browser fingerspelling), Web Crypto API (AES-GCM 256-bit).

---

## 2. Architectural Data Flow & The Closed Loop

```text
Student Interaction (Chat / Exercise / Camera / Vision)
       │
       ▼
1. Learning Event Store (src/lib/learningEvents.ts)
   - Emits event on in-memory Event Bus
   - Persists to users/{uid}/learningEvents/{eventId}
       │
       ▼
2. Unified Student State Engine (src/lib/studentStateEngine.ts)
   - Evaluates response latency & error streaks (Learning Strain)
   - Updates concept mastery & SM-2 retention schedules
   - Auto-tunes active pedagogy (Scaffolded, Analogies, Worked Example, Socratic, Rigorous)
   - Persists to users/{uid}/studentState/current (with offline debounce)
       │
       ▼
3. Concept Graph & Intervention Engine (src/lib/conceptGraph.ts)
   - Detects missing prerequisites when accuracy drops
   - Generates actionable remediation directives (e.g., review "pointers" before "dynamic_memory")
       │
       ▼
4. Server-Side AI Router & Persona Engine (api/_lib/)
   - Authenticates user via Firebase Auth ID Token (Bearer JWT in authGuard.ts)
   - Classifies task deterministically (fast, reasoning, vision, code) in router.ts
   - Injects real-time student state, cognitive stage, and pedagogical directives into system prompt
   - Quality Guard sanitizes response and validates code blocks
       │
       ▼
5. AI Response & Continuous Evaluation
   - AI streams personalized explanation via SSE
   - Student feedback (helpful/unhelpful) auto-pivots pedagogy score
   - Pre/post evaluation scores measured via Hake's normalized gain (g)
       ↺ (Closed Loop)
```

---

## 3. Server-Side AI Pipeline (`api/` & `api/_lib/`)

All AI inference in production is mediated by serverless endpoints. Client browsers **never** communicate directly with external AI provider APIs using exposed master keys.

| Module | Responsibility |
|---|---|
| `api/gemini/chat.ts` | Primary chat endpoint. Enforces auth, IP/user rate limiting, streaming SSE response, and telemetry logging. |
| `api/_lib/authGuard.ts` | Cryptographic verification of Firebase JWT tokens using Google public x509 certs. Enforces strict UID binding. |
| `api/_lib/router.ts` | **Deterministic, zero-latency task classifier**. Routes requests to optimal provider/model based on intent and payload without consuming AI tokens. |
| `api/_lib/ai.ts` | Multi-provider client abstraction (Gemini, Groq, NVIDIA, xAI), persona builder, Bloom's cognitive level integration, and student state prompt injection. |
| `api/_lib/rateLimiter.ts` | Sliding-window in-memory rate limiter per IP and per UID to prevent API abuse and cost surges. |
| `api/_lib/qualityGuard.ts` | Pre/post response validator. Strips hallucinated tokens, repairs unclosed markdown code blocks, and monitors latency/token usage. |
| `api/_lib/telemetry.ts` | Structured audit logging of AI requests, latencies, provider fallbacks, and error rates. |

---

## 4. Student Intelligence & Adaptive State Core

| File | Purpose |
|---|---|
| `src/lib/studentStateEngine.ts` | Canonical student state manager. Manages `cognitiveStage`, `activePedagogy`, `pedagogyEffectiveness`, `conceptMastery`, and `learningStrain`. Hydrates deterministically from event history. |
| `src/lib/learningEvents.ts` | Persistent append-only event stream. Dispatches events across modules and records to Firestore `/users/{uid}/learningEvents/`. |
| `src/lib/conceptGraph.ts` | Domain knowledge graph. Defines relationships, prerequisites, and root-cause diagnostic algorithms for struggling students. |
| `src/lib/spacedRetention.ts` | SuperMemo SM-2 spaced repetition scheduler for long-term concept retention (1d, 3d, 7d, 14d...). |
| `src/lib/evaluationEngine.ts` | Mathematical calculation of Hake's Normalized Gain ($g = \frac{Post - Pre}{100 - Pre}$) for learning efficacy measurement. |

---

## 5. Spatial Memory & Vision Companion (`src/lib/spatialMemoryEngine.ts`)

- **Edge-First Computer Vision**: Visual detection (MediaPipe / Vision models) identifies physical objects from client video frames. Video frames are processed in volatile browser memory and **never saved to disk or cloud (0% Disk / 0% Cloud)**.
- **Multi-Instance Identity**: Tracks objects by category and room (e.g. *Living Room TV Remote* vs *Bedroom AC Remote*) with distinct IDs and chronological movement history (last 10 surfaces).
- **Epistemic Honesty**: If an object hasn't been observed, Cognify truthfully states it hasn't seen it rather than hallucinating a location. Fully localized in English, Arabic, and French.

---

## 6. Security, Privacy & Data Sovereignty

- **Multi-Tenant Isolation**: Enforced at the Firestore rule layer (`firestore.rules`). Every student document `/users/{uid}` is strictly accessible only to `request.auth.uid`.
- **Chat Thread Privacy**: `/users/{userId}/threads/{threadId}` is strictly restricted to `isOwner(userId)`. Administrative and organizational accounts **cannot** view private student conversations with the AI.
- **Right to Erasure & Portability**: Handled via `StudentPrivacyCenter.tsx`:
  - **Full Data Export**: One-click machine-readable JSON archive containing all user records, masteries, events, and memories.
  - **Two-Tier Erasure**: Option to reset pedagogical memory vs. permanent cascade account deletion (Firestore documents, subcollections, Auth user, and localStorage).
- **Client Storage Shield (`src/lib/cryptoShield.ts`)**: For user-provided developer API keys (BYOK), utilizes the browser's native **Web Crypto API (AES-GCM 256-bit with PBKDF2)** for secure async storage, and salted stream obfuscation for sync reads.

---

## 7. Verification & Production Build Pipeline

```bash
# Type verification (0 errors required)
npx tsc --noEmit

# Automated verification suite (354 checks: 300 unit + 54 E2E simulation)
npm test

# Production build (Vite client bundle + serverless/node bundle)
npm run build
```

---

## 8. Directory & File Reference

### Root / Configuration
| File | Purpose |
|---|---|
| `package.json` | Project manifest: dependencies + scripts (`dev`, `build`, `lint`, `start`). |
| `package-lock.json` | Exact locked dependency versions (used by `npm ci` / Vercel). |
| `tsconfig.json` | TypeScript compiler options (ES2022, JSX, `@/*` paths, `noEmit`). |
| `vite.config.ts` | Vite build config: React + Tailwind plugins, `@` alias, HMR. |
| `index.html` | HTML shell that mounts React; inline theme (dark/light) script. |
| `.env.example` | Template for environment variables (`GEMINI_API_KEY`). |
| `.gitignore` | Files git ignores (`node_modules`, `dist`, `.env*`…). |
| `metadata.json` | App metadata (name, description, camera/mic permissions). |
| `README.md` | Project intro and run instructions. |

### Firebase & security
| File | Purpose |
|---|---|
| `firebase-applet-config.json` | Firebase web config (public, not secret). |
| `firebase-blueprint.json` | Documentation of the Firestore `UserProfile` schema. |
| `firestore.rules` | Firestore security rules (`isOwner`, `isAdmin`, `isValidUser`). |
| `storage.rules` | Storage rules: authenticated users upload to their own path, ≤5MB. |

### Deployment & CI
| File | Purpose |
|---|---|
| `vercel.json` | Static Vercel deploy config (`vite build` → `dist`, SPA rewrite). |
| `.github/workflows/ci.yml` | Runs `lint` + `build` on every push / PR to `main`. |
| `.github/pull_request_template.md` | PR checklist. |
| `CONTRIBUTING.md` | Team workflow: branch + PR + conflict resolution. |

### Backend (`server/`)
| File | Purpose |
|---|---|
| `server.ts` | Express entry (port 3000): Vite middleware in dev, static `dist` in prod, mounts the Gemini router. |
| `server/routes.ts` | Registers all `/api/gemini/*` POST routes. |
| `server/gemini.ts` | Core AI: adaptive system prompt, chat SSE stream, image generation, `generateAssessment`, `translateQuiz`, `withRetry`. |
| `server/geminiService.ts` | Accessibility AI: sign translation, caption enhancement, dysarthria/Euphonia decoding, `correctTranscript`. |

### Frontend entry & libraries (`src/`, `src/lib/`)
| File | Purpose |
|---|---|
| `src/main.tsx` | Boots React: renders `<App>` in `<ErrorBoundary>` + `<StrictMode>`. |
| `src/App.tsx` | Root component: auth state, profile loading, hash routing, theme, view rendering. |
| `src/index.css` | Global Tailwind styles and CSS variables. |
| `src/types.ts` | Shared types: `Message`, `UserProfile`, `ChatThread`, `Task`. |
| `src/lib/firebase.ts` | Firebase init (Auth/Firestore/Storage) + helpers (auth, data sanitising). |
| `src/lib/translations.ts` | i18n: 11 languages, `getTranslation`, `isRTL`. |
| `src/lib/utils.tsx` | Small helpers: `cn`, sign icons, date formatting. |
| `src/lib/tts.ts` | Shared text‑to‑speech helper (Arabic/Egyptian voice selection). |
| `src/lib/adaptiveSpeech.ts` | Adaptive pronunciation dictionary that learns from user corrections. |
| `src/lib/signClassifier.ts` | Local in‑browser ASL fingerspelling recogniser (TF.js). |

### Services (frontend → backend)
| File | Purpose |
|---|---|
| `src/services/gemini.ts` | Calls `/api/gemini/*` for chat/quizzes, with a direct‑to‑Gemini fallback + `fetchGeminiWithRetry`. |
| `src/services/geminiService.ts` | Calls the accessibility endpoints (sign, captions, transcript correction). |

### Components (`src/components/`)
| File | Purpose |
|---|---|
| `ChatInterface.tsx` | Full chat UI: messages, file upload, STT, streaming, reactions (largest file). |
| `Sidebar.tsx` | Navigation: threads, language, theme, view switching. |
| `RightPanel.tsx` | Small panel: IQ score, points, growth suggestion. |
| `Onboarding.tsx` | Sign‑up steps → **AI field‑based assessment** (replaces the old IQ quiz). |
| `Login.tsx` | Auth flow: path selection, Google, email/password, reset. |
| `StudentAnalytics.tsx` | Academic analytics (Recharts): GPA, goals, deadlines, health score. |
| `AdminDashboard.tsx` | Admin: Directory + Accessibility Center; users, roles, org managers, reports. |
| `OrgDashboard.tsx` | Org (charity) staff view — their organization's users only, read‑only. |
| `ProfilePage.tsx` | View/edit profile + AI feedback stats. |
| `Toast.tsx` | Global toast notifications (via CustomEvent). |
| `ErrorBoundary.tsx` | Catches React render errors and shows a styled screen. |
| `DisabilityModeView.tsx` | Wrapper for special‑needs users (assistant / settings / sign studio tabs). |
| `AccessibilityOverlay.tsx` | Floating overlay: TTS, STT, **hybrid sign recognition (local model + on‑demand Gemini)**. |
| `SignVideoStudio.tsx` | Text/speech → **AI reply** → 3D avatar signs the reply. |
| `SignAvatar3D.tsx` | Pure Three.js procedural signing avatar (fingerspelling + word gestures). |
| `LiveCaptions.tsx` | Live captions + **adaptive correction with confidence & alternatives**. |
| `AssessmentQuiz.tsx` | Reusable AI‑generated assessment (generate + score). |
| `ReadAloudSelection.tsx` | Highlight any text → floating 🔊 button reads it aloud. |

### Model assets (`public/models/sign/`)
| File | Purpose |
|---|---|
| `model.json` | TF.js sign‑recognition model topology. |
| `group1-shard1of1.bin` | Model weights (~1.1MB). |
| `labels.json` | The 24 static letters (A–Y) the model recognises. |

---

## 9. Core Architectural Tenets

- **Server-Side AI Security**: Production inference executes strictly server-side (`/api/gemini/*`). Master provider API keys never touch client JavaScript bundles.
- **Continuous Closed-Loop Adaptation**: The system prompt dynamically injects the student's Bloom's cognitive level, active pedagogy strategy, diagnosed prerequisite gaps, and learning strain signals.
- **Observed Mastery Over Static IQ**: Cognify measures concept accuracy, retention curves (SM-2), and normalized learning gains ($g$). It does not derive intelligence or lock students into static tracks based on an IQ score.
- **Accessibility Integration**: Accessibility modes (sign language avatars, Motor Euphonia speech reconstruction, Vision Companion) are native first-class citizens embedded directly in the routing and telemetry layers.

---

## 10. Development & Verification Commands

```bash
# Install dependencies
npm install

# Start development server (Vite + local server)
npm run dev

# Run static type verification
npx tsc --noEmit

# Execute full automated test suite (354 tests across unit & E2E)
npm test

# Build production bundle
npm run build
```
