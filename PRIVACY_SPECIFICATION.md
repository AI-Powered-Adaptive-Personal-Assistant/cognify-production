# Cognify 2.0: Official Privacy & Data Boundary Specification

**Status**: Verified & Enforced  
**Version**: 2.0.0  
**Compliance Standard**: GDPR Principles, Egyptian Personal Data Protection Law (Law No. 151 of 2020), Firebase Least-Privilege Security Model.

---

## 1. Core Privacy Architecture Principles

1. **Zero-Knowledge Media Processing (Edge-First Privacy)**:
   - Camera video frames and microphone audio streams are processed **purely on the client device** in volatile browser memory (WebGL, Web Audio, MediaPipe).
   - **NO raw video frames or raw audio samples are ever written to disk, sent across the network, or saved to any database.**
   - Once a frame is analyzed for accessibility or spatial objects, its image bitmap is immediately garbage collected.

2. **Strict Multi-Tenant Isolation**:
   - Every piece of personal learning data is strictly partitioned by the user's authenticated UID (`users/{uid}`).
   - Cross-account access is strictly prevented at both the application layer (memory cache partitioning) and the database security layer (`firestore.rules`).

3. **User Sovereignty & Right to Erasure**:
   - Students have complete control to inspect, export (JSON archive), or permanently erase their entire account data at any time through the **Privacy Center** (`src/components/PrivacyCenter.tsx`).

---

## 2. Data Taxonomy: Persisted vs. Ephemeral

| Data Category | Purpose | Persistence Medium | Path / Location | Retention & Deletion Policy |
|---|---|---|---|---|
| **User Profile & Onboarding** | Account identity, academic level, points, accessibility settings. | Firestore + Local Device Cache | `/users/{uid}` | Retained while account active. Permanently deleted upon account erasure. |
| **Student State Engine** | Concept masteries, learning strain, active interventions, SM-2 retention. | Firestore + Local Device Cache | `/users/{uid}/studentState/current` | Retained to maintain adaptive continuity. Can be reset or erased anytime. |
| **Learning Event Stream** | Audit trail of practice answers, time-stamped learning milestones, feedback. | Firestore (5s debounce) + Local Cache | `/users/{uid}/learningEvents/{eventId}` | Persisted for longitudinal learning analytics. Purged completely upon account erasure. |
| **Conversational Threads** | Chat history with AI assistant, explanations, and practice transcripts. | Firestore (capped at 300 turns) | `/users/{uid}/threads/{threadId}` | Deletable per thread or full wipe via Privacy Center. |
| **Spatial Object Locations** | Observed physical item names, rooms, surfaces, and 10-item movement history. | Firestore + Local Device Cache | `/users/{uid}.spatialMemories` | Strictly isolated per UID. Can be cleared directly in Vision Companion or Privacy Center. |
| **Camera Video Frames** | Real-time object and hazard detection for visually impaired students. | **NEVER PERSISTED (0% Disk / 0% Cloud)** | In-Memory WebGL Canvas Only | **Ephemeral**: Discarded immediately after inference (within ~30ms). |
| **Microphone Audio Streams** | Voice input and Speech-to-Text translation. | **NEVER PERSISTED (0% Disk / 0% Cloud)** | In-Memory AudioBuffer Only | **Ephemeral**: Audio stream tracks are closed immediately upon speech termination. |
| **DevTools Security Probes** | Detection of DOM tampering and unauthorized console inspection. | Firestore (Founder Only) | `/securityAudits/{auditId}` | Retained for system security integrity. Read-only strictly by primary founder. |

---

## 3. Multi-Tenant Boundary Enforcement

### A. Database Security Rule Guarantees (`firestore.rules`)
```text
match /users/{userId} {
  // Only the owner of the UID (or validated super admin) can read or write
  allow read: if isOwner(userId) || isAdmin();
  allow update: if isOwner(userId) && isValidUser(request.resource.data);
  
  // All subcollections (learningEvents, threads, studentState, etc.) inherit strict ownership
  match /{sub}/{document=**} {
    allow read, write: if isOwner(userId);
  }
}
```

### B. In-Memory Cache Isolation
In the client-side single-page app, memory stores (`userSpatialCache`, `managerCache`) partition state by UID. Even if multiple users log in sequentially on a shared device:
- `getSpatialObjects(uid)` strictly verifies `record.uid === uid`.
- Switching accounts purges and re-hydrates the cache strictly from the active session.

---

## 4. User Data Controls in Cognify 2.0

1. **Self-Service Data Export**:
   - Students can download a full, unencrypted JSON backup of their profile, learning events, concept masteries, and conversation threads.
2. **Pedagogical Reset**:
   - Students can reset their cognitive state and concept mastery history without deleting their account.
3. **One-Click Permanent Account Deletion**:
   - Cascades deletion through Firebase Auth, Firestore `/users/{uid}` and all nested subcollections, and purges all local storage keys (`cognify_*`).
