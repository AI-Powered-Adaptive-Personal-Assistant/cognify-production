/**
 * Unified Student State Engine (Point 1)
 * The Single Source of Truth for student state in Cognify 2.0.
 * Coordinates cognitive stage, concept mastery, prerequisite diagnosis,
 * active interventions, and spaced retention schedules.
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, cleanDataForFirestore } from './firebase';
import { CognitiveStage, resolveCognitiveStage } from '../../api/_lib/ai';
import { diagnosePrerequisiteGap, PrerequisiteDiagnosis } from './conceptGraph';
import { decideIntervention, InterventionDirective } from './interventionEngine';
import {
  RetentionSchedule,
  createInitialRetentionSchedule,
  calculateNextReview,
} from './spacedRetention';
import { eventBus, LearningEvent, ExerciseAnsweredPayload } from './learningEvents';

/**
 * Checks whether a user ID represents an unauthenticated guest or demo session.
 * Guest users bypass remote Firestore network calls completely.
 */
export function isGuestUser(uid?: string | null): boolean {
  return !uid || uid === 'guest' || uid === 'anonymous' || uid === 'demo';
}

/**
 * Canonical Firestore document path for student state.
 * Structured under users/{uid}/studentState/current subcollection.
 */
export const studentStateDoc = (uid: string) => doc(db, 'users', uid, 'studentState', 'current');

export interface ConceptMasteryRecord {
  conceptId: string;
  attempts: number;
  correct: number;
  accuracy: number;
  confidence: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  lastTested: number;
  mistakeTypes: string[];
}

export type StruggleSignalType = 'high_response_latency' | 'repeated_errors' | 'prerequisite_gap' | 'frequent_hints';

export interface LearningStrain {
  possibleStruggle: number; // 0.0 (smooth/fluent) to 1.0 (high strain)
  confidence: number;       // 0.0 to 1.0 (statistical confidence in struggle detection)
  signals: StruggleSignalType[];
}

export interface StudentState {
  uid: string;
  /**
   * Temporary initial onboarding pedagogical baseline (NOT a measurement of mental capacity or IQ).
   * Used strictly to adapt initial explanation tone and scaffolding.
   */
  cognitiveStage: CognitiveStage;
  activePedagogy: 'analogies' | 'scaffolded' | 'worked_example' | 'socratic' | 'advanced_rigor';
  learningStrain: LearningStrain;
  struggleSignal: number;     // 0.0 to 1.0 (convenience scalar matching learningStrain.possibleStruggle)
  cognitiveLoadScore: number; // Deprecated alias maintained for backward compatibility
  conceptMastery: Record<string, ConceptMasteryRecord>;
  retentionSchedules: Record<string, RetentionSchedule>;
  activeInterventions: Record<string, InterventionDirective>;
  totalExercisesCompleted: number;
  lastActiveTimestamp: number;
}

const STORAGE_PREFIX = 'cognify_student_state_';

export function createInitialStudentState(uid: string, level?: string): StudentState {
  return {
    uid,
    cognitiveStage: resolveCognitiveStage(level),
    activePedagogy: 'scaffolded',
    learningStrain: {
      possibleStruggle: 0.2,
      confidence: 0.5,
      signals: [],
    },
    struggleSignal: 0.2,
    cognitiveLoadScore: 0.2,
    conceptMastery: {},
    retentionSchedules: {},
    activeInterventions: {},
    totalExercisesCompleted: 0,
    lastActiveTimestamp: Date.now(),
  };
}

export class StudentStateManager {
  private state: StudentState;
  private changeListeners: Set<(state: StudentState) => void> = new Set();
  private unsubscribeEventBus?: () => void;
  private isLoaded: boolean = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingConcepts: Set<string> = new Set();
  private hasPendingWrites: boolean = false;
  private beforeUnloadHandler?: () => void;

  constructor(uid: string, level?: string) {
    // 1) Fast paint from local device cache
    this.state = this.loadFromLocalCache(uid) || createInitialStudentState(uid, level);
    this.initEventListeners();

    // 2) Unauthenticated or guest sessions skip remote Firestore hydration entirely
    if (isGuestUser(uid)) {
      this.isLoaded = true;
    } else {
      this.hydrateFromFirestore(uid, level);
    }

    // 3) Bind browser window beforeunload to flush any pending debounced writes
    if (typeof window !== 'undefined') {
      this.beforeUnloadHandler = () => {
        this.flushPendingWrites();
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  public getState(): StudentState {
    return { ...this.state };
  }

  /** True once authoritative state has loaded (instant for guests, post-hydration for auth users) */
  public get loaded(): boolean {
    return this.isLoaded;
  }

  public get isHydrated(): boolean {
    return this.isLoaded;
  }

  public subscribe(listener: (state: StudentState) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notify() {
    const snap = { ...this.state };
    this.changeListeners.forEach((fn) => {
      try {
        fn(snap);
      } catch (err) {
        console.error('[StudentStateManager] Error in subscriber callback:', err);
      }
    });
  }

  public destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.beforeUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    this.flushPendingWrites();
    if (this.unsubscribeEventBus) {
      this.unsubscribeEventBus();
    }
    this.changeListeners.clear();
  }

  private initEventListeners() {
    this.unsubscribeEventBus = eventBus.on('EXERCISE_ANSWERED', (event: LearningEvent<ExerciseAnsweredPayload>) => {
      if (event.uid === this.state.uid && event.payload) {
        this.recordAnswer(
          event.payload.conceptId || event.payload.topic,
          event.payload.isCorrect,
          event.payload.responseTimeMs,
          event.payload.mistakeType
        );
      }
    });
  }

  /**
   * Hydrates state from Firestore with deep merging across multi-device sessions.
   */
  private async hydrateFromFirestore(uid: string, level?: string) {
    try {
      const snap = await getDoc(studentStateDoc(uid));
      if (snap.exists()) {
        const remote = snap.data() as Partial<StudentState>;

        // Deep merge conceptMastery (prioritize higher attempts & latest tested timestamp)
        const mergedMastery: Record<string, ConceptMasteryRecord> = { ...this.state.conceptMastery };
        if (remote.conceptMastery) {
          for (const [cid, remoteRec] of Object.entries(remote.conceptMastery)) {
            const localRec = mergedMastery[cid];
            if (!localRec) {
              mergedMastery[cid] = remoteRec;
            } else {
              mergedMastery[cid] = {
                ...localRec,
                attempts: Math.max(localRec.attempts, remoteRec.attempts),
                correct: Math.max(localRec.correct, remoteRec.correct),
                accuracy: remoteRec.attempts >= localRec.attempts ? remoteRec.accuracy : localRec.accuracy,
                confidence: Math.max(localRec.confidence, remoteRec.confidence),
                consecutiveCorrect: Math.max(localRec.consecutiveCorrect, remoteRec.consecutiveCorrect),
                consecutiveIncorrect: Math.min(localRec.consecutiveIncorrect, remoteRec.consecutiveIncorrect),
                lastTested: Math.max(localRec.lastTested || 0, remoteRec.lastTested || 0),
                mistakeTypes: Array.from(new Set([...(localRec.mistakeTypes || []), ...(remoteRec.mistakeTypes || [])])),
              };
            }
          }
        }

        // Deep merge retention schedules
        const mergedSchedules: Record<string, RetentionSchedule> = { ...this.state.retentionSchedules };
        if (remote.retentionSchedules) {
          for (const [cid, remoteSch] of Object.entries(remote.retentionSchedules)) {
            const localSch = mergedSchedules[cid];
            if (!localSch || (remoteSch.repetitions || 0) >= (localSch.repetitions || 0)) {
              mergedSchedules[cid] = remoteSch;
            }
          }
        }

        // Deep merge active interventions
        const mergedInterventions: Record<string, InterventionDirective> = {
          ...remote.activeInterventions,
          ...this.state.activeInterventions,
        };

        this.state = {
          ...createInitialStudentState(uid, level),
          ...remote,
          uid,
          conceptMastery: mergedMastery,
          retentionSchedules: mergedSchedules,
          activeInterventions: mergedInterventions,
          totalExercisesCompleted: Math.max(this.state.totalExercisesCompleted, remote.totalExercisesCompleted || 0),
          lastActiveTimestamp: Math.max(this.state.lastActiveTimestamp, remote.lastActiveTimestamp || 0),
        };

        this.saveToLocalCache();
      }
    } catch (err) {
      console.warn('[StudentStateManager] Firestore hydration failed, using local cache fallback:', err);
    } finally {
      this.isLoaded = true;
      this.notify();
    }
  }

  /**
   * Process an answered exercise and update student state in closed-loop fashion.
   * Debounces Firestore network writes by 5 seconds to conserve quota.
   */
  public recordAnswer(
    conceptId: string,
    isCorrect: boolean,
    responseTimeMs: number,
    mistakeType?: string
  ): { state: StudentState; intervention?: InterventionDirective } {
    const now = Date.now();
    const cleanConcept = conceptId.toLowerCase().trim().replace(/[\s-]+/g, '_');

    let record = this.state.conceptMastery[cleanConcept];
    if (!record) {
      record = {
        conceptId: cleanConcept,
        attempts: 0,
        correct: 0,
        accuracy: 0,
        confidence: 0.5,
        consecutiveCorrect: 0,
        consecutiveIncorrect: 0,
        lastTested: now,
        mistakeTypes: [],
      };
    }

    record.attempts += 1;
    record.lastTested = now;

    if (isCorrect) {
      record.correct += 1;
      record.consecutiveCorrect += 1;
      record.consecutiveIncorrect = 0;
      const streakBonus = Math.min(0.15, record.consecutiveCorrect * 0.05);
      record.confidence = Math.min(1.0, Math.round((record.confidence + 0.12 + streakBonus) * 100) / 100);
    } else {
      record.consecutiveIncorrect += 1;
      record.consecutiveCorrect = 0;
      record.confidence = Math.max(0.1, Math.round((record.confidence - 0.15) * 100) / 100);
      if (mistakeType && !record.mistakeTypes.includes(mistakeType)) {
        record.mistakeTypes.push(mistakeType);
      }
    }

    record.accuracy = Math.round((record.correct / record.attempts) * 100) / 100;
    this.state.conceptMastery[cleanConcept] = record;
    this.state.totalExercisesCompleted += 1;
    this.state.lastActiveTimestamp = now;

    // Diagnose prerequisite gaps using concept graph
    const prereqDiagnosis: PrerequisiteDiagnosis = diagnosePrerequisiteGap(
      cleanConcept,
      this.state.conceptMastery
    );

    // Calculate empirical learning strain signals
    const detectedSignals: StruggleSignalType[] = [];
    if (responseTimeMs > 15000) {
      detectedSignals.push('high_response_latency');
    }
    if (record.consecutiveIncorrect >= 2) {
      detectedSignals.push('repeated_errors');
    }
    if (prereqDiagnosis.hasPrerequisiteGap) {
      detectedSignals.push('prerequisite_gap');
    }

    const latencyWeight = Math.min(0.5, responseTimeMs / 30000);
    const errorWeight = Math.min(0.5, record.consecutiveIncorrect * 0.25);
    const possibleStruggle = Math.min(1.0, Math.round((latencyWeight + errorWeight) * 100) / 100);
    const confidence = Math.min(1.0, Math.round((0.5 + Math.min(0.5, record.attempts * 0.1)) * 100) / 100);

    this.state.learningStrain = {
      possibleStruggle,
      confidence,
      signals: detectedSignals,
    };
    this.state.struggleSignal = possibleStruggle;
    this.state.cognitiveLoadScore = possibleStruggle;

    // Decide whether a pedagogical intervention is warranted
    const intervention = decideIntervention({
      conceptId: cleanConcept,
      consecutiveIncorrect: record.consecutiveIncorrect,
      consecutiveCorrect: record.consecutiveCorrect,
      accuracyRate: record.accuracy,
      avgResponseTimeMs: responseTimeMs,
      prerequisiteDiagnosis: prereqDiagnosis,
      repeatedMistakeType: mistakeType,
    });

    this.state.activeInterventions[cleanConcept] = intervention;
    this.state.activePedagogy = intervention.strategy;

    // Update spaced retention schedule
    let schedule = this.state.retentionSchedules[cleanConcept];
    if (!schedule) {
      schedule = createInitialRetentionSchedule(cleanConcept);
    }
    const qualityScore = isCorrect ? (responseTimeMs < 8000 ? 5 : 4) : 2;
    this.state.retentionSchedules[cleanConcept] = calculateNextReview(schedule, qualityScore);

    // Track touched concepts and mark pending writes
    this.pendingConcepts.add(cleanConcept);
    this.hasPendingWrites = true;

    // Instant local cache save
    this.saveToLocalCache();

    // Schedule debounced Firestore write (5 seconds) for non-guest users
    if (!isGuestUser(this.state.uid)) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.flushPendingWrites();
      }, 5000);
    }

    // Notify all active subscribers of the state transition
    this.notify();

    return { state: { ...this.state }, intervention };
  }

  /**
   * Flushes any pending local mutations to Firestore using targeted dot-path keys.
   */
  public async flushPendingWrites(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (isGuestUser(this.state.uid) || !this.hasPendingWrites) {
      return;
    }

    const touched = Array.from(this.pendingConcepts);
    this.pendingConcepts.clear();
    this.hasPendingWrites = false;

    try {
      const s = this.state;
      const patch: Record<string, unknown> = {
        cognitiveStage: s.cognitiveStage,
        activePedagogy: s.activePedagogy,
        learningStrain: s.learningStrain,
        struggleSignal: s.struggleSignal,
        cognitiveLoadScore: s.cognitiveLoadScore,
        totalExercisesCompleted: s.totalExercisesCompleted,
        lastActiveTimestamp: s.lastActiveTimestamp,
      };

      for (const cid of touched) {
        if (s.conceptMastery[cid]) {
          patch[`conceptMastery.${cid}`] = s.conceptMastery[cid];
        }
        if (s.retentionSchedules[cid]) {
          patch[`retentionSchedules.${cid}`] = s.retentionSchedules[cid];
        }
        if (s.activeInterventions[cid]) {
          patch[`activeInterventions.${cid}`] = s.activeInterventions[cid];
        }
      }

      const ref = studentStateDoc(s.uid);
      const cleanPatch = cleanDataForFirestore(patch);

      try {
        await updateDoc(ref, cleanPatch as Record<string, any>);
      } catch (err: any) {
        if (err?.code === 'not-found' || err?.message?.includes('No document to update')) {
          await setDoc(ref, cleanDataForFirestore(s), { merge: true });
        } else {
          console.warn('[StudentStateManager] Firestore dot-path update warning:', err);
        }
      }
    } catch (writeErr) {
      console.error('[StudentStateManager] Failed to flush writes to Firestore:', writeErr);
    }
  }

  private saveToLocalCache() {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `${STORAGE_PREFIX}${this.state.uid}`,
          JSON.stringify(this.state)
        );
      }
    } catch (e) {
      console.warn('[StudentStateManager] Local cache save failed:', e);
    }
  }

  private loadFromLocalCache(uid: string): StudentState | null {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
        if (raw) return JSON.parse(raw);
      }
    } catch {
      // Ignore
    }
    return null;
  }
}

const managerCache: Map<string, StudentStateManager> = new Map();

/**
 * Returns or creates the singleton StudentStateManager for a given user ID.
 * Ensures consistent reactive state across all UI components and background handlers.
 */
export function getStudentStateManager(uid: string, level?: string): StudentStateManager {
  if (!managerCache.has(uid)) {
    managerCache.set(uid, new StudentStateManager(uid, level));
  }
  return managerCache.get(uid)!;
}