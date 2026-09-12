/**
 * Cognify 2.0 Automated Verification Suite (Points 21 & 22)
 * Tests core pedagogical, mathematical, and architectural engines.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { calculateNormalizedGain } from '../src/lib/evaluationEngine.js';
import { getConcept, diagnosePrerequisiteGap, detectConceptFromText } from '../src/lib/conceptGraph.js';
import { checkRateLimit } from '../api/_lib/rateLimiter.js';
import { validateAndSanitizeResponse } from '../api/_lib/qualityGuard.js';
import { calculateNextReview, createInitialRetentionSchedule } from '../src/lib/spacedRetention.js';
import { resolveCognitiveStage, guard, buildPersona, buildContents } from '../api/_lib/ai.js';
import { verifyRequestAuth, setTestCertProvider, getExpectedProjectId } from '../api/_lib/authGuard.js';
import { eventBus, getLearningEventHistory } from '../src/lib/learningEvents.js';
import {
  getStudentStateManager,
  createInitialStudentState,
  isGuestUser,
  studentStateDoc,
  projectEventsToState,
} from '../src/lib/studentStateEngine.js';
import { classifyRequest } from '../api/_lib/router.js';
import {
  extractSpatialObjectsFromVision,
  saveSpatialObject,
  getSpatialObjects,
  querySpatialMemory,
} from '../src/lib/spatialMemoryEngine.js';
import { localize } from '../src/lib/translations.js';
import { canAccessView } from '../src/lib/access.js';
import {
  getDatabaseHealth,
  getCollectionStats,
  generateFullSystemBackupJson,
  cleanStaleSessionsAndCache,
  generateDatabaseAuditReport,
  getFirebaseFreeTierQuotas,
  FIRESTORE_SPARK_LIMITS,
  BACKEND_SPARK_LIMITS,
} from '../src/lib/databaseHub.js';
import {
  recordHttpRequest,
  getHttpMetrics,
  categorizeUrl,
} from '../src/lib/httpTracker.js';
import { resolveClientIp, logSecurityEvent, isDatabaseDashboardActive, isTargetInsideDatabaseDashboard } from '../src/lib/securityTracker.js';
import { cleanForSpeech } from '../src/lib/tts.js';
import { getUserPresenceStatus, isUserOnlineNow } from '../src/lib/presence.js';
import { isAdminUser, isSecurityAuditsOwner, isDatabaseHubOwner } from '../src/lib/roles.js';
import {
  encryptSecretSync,
  decryptSecretSync,
  isEncryptedSecret,
  secureSaveKey,
  secureLoadKeySync,
  secureRemoveKey,
  autoMigrateStorageKeys,
} from '../src/lib/cryptoShield.js';

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    totalFailed++;
  }
}

async function run() {
  console.log('\n--- Running Cognify 2.0 Hardened Test Suite ---');

  // 1. Evaluation Engine & Hake's Gain Tests
  console.log('\n[1] Evaluation Engine (Hake Normalized Gain)');
  {
    const g1 = calculateNormalizedGain(40, 70);
    assert(Math.abs(g1 - 0.5) < 0.001, 'Standard gain calculation (40% to 70% -> g=0.5)');

    const g2 = calculateNormalizedGain(100, 100);
    assert(g2 === 1.0, 'Initial 100% score maintained -> g=1.0');

    const g3 = calculateNormalizedGain(80, 60);
    assert(g3 < 0 && g3 >= -1.0, 'Regression properly returns negative gain');
  }

  // 2. Concept Graph & Root-Cause Diagnosis Tests
  console.log('\n[2] Concept Graph & Prerequisite Diagnosis');
  {
    const pointers = getConcept('pointers');
    assert(!!pointers && pointers.prerequisites.includes('memory_addresses'), 'Concept registry contains valid nodes & prerequisites');

    const mockMastery = {
      pointers: { accuracy: 0.4, attempts: 5, confidence: 0.3 },
    };
    const diagnosis = diagnosePrerequisiteGap('dynamic_memory', mockMastery as any);
    assert(diagnosis.hasPrerequisiteGap === true, 'Correctly flags prerequisite gap');
    assert(diagnosis.rootGapConcept?.id === 'pointers', 'Accurately diagnoses pointers as the root stumbling block');

    const masteredMastery = {
      pointers: { accuracy: 0.9, attempts: 10, confidence: 0.95 },
      heap_stack: { accuracy: 0.85, attempts: 6, confidence: 0.9 },
    };
    const healthyDiagnosis = diagnosePrerequisiteGap('dynamic_memory', masteredMastery as any);
    assert(healthyDiagnosis.hasPrerequisiteGap === false, 'Recognizes when prerequisites are properly mastered');
  }

  // 3. Spaced Repetition (SM-2) Tests
  console.log('\n[3] Spaced Repetition (Ebbinghaus Intervals)');
  {
    const initial = createInitialRetentionSchedule('pointers');
    assert(initial.intervalDays === 1, 'Initial interval is 1 day');

    const rep1 = calculateNextReview(initial, 5);
    assert(rep1.repetitions === 1 && rep1.status === 'learning', 'First repetition transitions to learning');

    const rep2 = calculateNextReview(rep1, 5);
    assert(rep2.repetitions === 2 && rep2.intervalDays === 3, 'Second repetition interval is 3 days');

    const regressed = calculateNextReview(rep2, 1);
    assert(regressed.repetitions === 0 && regressed.status === 'regressed', 'Low quality score resets repetition counter');
  }

  // 4. Rate Limiter Tests (Dual-Tier: IP & User)
  console.log('\n[4] Rate Limiter (Dual-Tier: IP & User)');
  {
    const testIp = 'ip:192.168.1.100';
    const res1 = checkRateLimit(testIp, 3);
    assert(res1.allowed === true && res1.remaining === 2, 'Initial IP request allowed with decrementing remaining');
    checkRateLimit(testIp, 3);
    checkRateLimit(testIp, 3);
    const blocked = checkRateLimit(testIp, 3);
    assert(blocked.allowed === false && blocked.remaining === 0, 'Exceeding IP limit correctly blocks');

    const testUser = 'user:student_456';
    const userRes1 = checkRateLimit(testUser, 2);
    assert(userRes1.allowed === true && userRes1.remaining === 1, 'User quota tracked independently');
  }

  // 5. AI Output Quality Guard Tests
  console.log('\n[5] AI Output Quality Guard');
  {
    const brokenCode = 'Here is your solution:\n```python\nprint("hello world")';
    const fixedCode = validateAndSanitizeResponse(brokenCode);
    assert(fixedCode.text.endsWith('\n```'), 'Repairs unclosed code block');

    const brokenMath = 'Formula is $$ E = mc^2';
    const fixedMath = validateAndSanitizeResponse(brokenMath);
    assert(fixedMath.text.endsWith('$$'), 'Repairs unclosed LaTeX block');

    const emptyRes = validateAndSanitizeResponse('   ');
    assert(emptyRes.isValid === false, 'Catches empty response');
  }

  // 6. Scientific Cognitive Stage Resolution (Decoupled from IQ)
  console.log('\n[6] Scientific Cognitive Stage Resolution (Decoupled from IQ)');
  {
    assert(resolveCognitiveStage('Basic') === 'foundational', 'Basic maps to foundational');
    assert(resolveCognitiveStage('Intermediate') === 'developing', 'Intermediate maps to developing');
    assert(resolveCognitiveStage('Proficient') === 'proficient', 'Proficient maps to proficient');
    assert(resolveCognitiveStage('Advanced') === 'advanced', 'Advanced maps to advanced');
    assert(resolveCognitiveStage(undefined) === 'developing', 'Undefined defaults to developing baseline without IQ');
  }

  // 7. Hardened Authentication Guard (Complete 6-Case Matrix & Production Env Validation)
  console.log('\n[7] Hardened Authentication Guard (6-Case Matrix & Project Validation)');
  {
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-mock-gemini-key';

    function createMockRes() {
      const headers: Record<string, string> = {};
      return {
        statusCode: 200,
        body: null as any,
        headers,
        setHeader(name: string, val: string) {
          headers[name] = val;
          return this;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          this.body = data;
          return this;
        },
      };
    }

    // Set up RSA key pairs for testing cryptographic verification
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const wrongKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const testKid = 'test-cert-kid-1';
    const projectId = getExpectedProjectId();

    function signTestJwt(header: any, payload: any, keyPem: string) {
      const h = Buffer.from(JSON.stringify(header)).toString('base64url');
      const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(`${h}.${p}`);
      const sig = signer.sign(keyPem, 'base64url');
      return `${h}.${p}.${sig}`;
    }

    // Register test public cert
    setTestCertProvider(async () => ({ [testKid]: publicKey }));

    try {
      const nowSec = Math.floor(Date.now() / 1000);

      // Case 1: No token -> 401
      const req1 = { method: 'POST', headers: {}, body: { uid: 'attacker_spoof_attempt' } };
      const res1 = createMockRes();
      const allowed1 = await guard(req1, res1);
      assert(!allowed1 && res1.statusCode === 401, 'Case 1: No token (body.uid spoof) -> 401 Unauthorized');

      // Case 2: Fake JWT -> 401
      const req2 = { method: 'POST', headers: { authorization: 'Bearer completely.fake.jwt' } };
      const res2 = createMockRes();
      const allowed2 = await guard(req2, res2);
      assert(!allowed2 && res2.statusCode === 401, 'Case 2: Fake JWT -> 401 Unauthorized');

      // Case 3: Wrong signature -> 401
      const wrongSigToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: projectId,
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_wrong_sig',
          user_id: 'student_wrong_sig',
          exp: nowSec + 3600,
          auth_time: nowSec,
        },
        wrongKeyPair.privateKey
      );
      const req3 = { method: 'POST', headers: { authorization: `Bearer ${wrongSigToken}` } };
      const res3 = createMockRes();
      const allowed3 = await guard(req3, res3);
      assert(!allowed3 && res3.statusCode === 401, 'Case 3: Wrong cryptographic signature -> 401 Unauthorized');

      // Case 4: Expired token -> 401
      const expiredToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: projectId,
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_expired',
          user_id: 'student_expired',
          exp: nowSec - 60,
          auth_time: nowSec - 3600,
        },
        privateKey
      );
      const req4 = { method: 'POST', headers: { authorization: `Bearer ${expiredToken}` } };
      const res4 = createMockRes();
      const allowed4 = await guard(req4, res4);
      assert(!allowed4 && res4.statusCode === 401, 'Case 4: Expired token -> 401 Unauthorized');

      // Case 5: Wrong project -> 401
      const wrongProjectToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: 'different-firebase-project',
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_wrong_proj',
          user_id: 'student_wrong_proj',
          exp: nowSec + 3600,
          auth_time: nowSec,
        },
        privateKey
      );
      const req5 = { method: 'POST', headers: { authorization: `Bearer ${wrongProjectToken}` } };
      const res5 = createMockRes();
      const allowed5 = await guard(req5, res5);
      assert(!allowed5 && res5.statusCode === 401, 'Case 5: Wrong project audience -> 401 Unauthorized');

      // Case 6: Valid Firebase RS256 token -> 200
      const validToken = signTestJwt(
        { alg: 'RS256', kid: testKid },
        {
          aud: projectId,
          iss: `https://securetoken.google.com/${projectId}`,
          sub: 'student_verified_200',
          user_id: 'student_verified_200',
          exp: nowSec + 3600,
          auth_time: nowSec,
        },
        privateKey
      );
      const req6 = { method: 'POST', headers: { authorization: `Bearer ${validToken}` } };
      const res6 = createMockRes();
      const allowed6 = await guard(req6, res6);
      if (allowed6) {
        res6.status(200).json({ ok: true, uid: (req6 as any).authenticatedUid });
      }
      assert(
        allowed6 === true && res6.statusCode === 200 && (req6 as any).authenticatedUid === 'student_verified_200',
        'Case 6: Valid Firebase RS256 token -> 200 OK'
      );
    } finally {
      // Clean up test cert provider
      setTestCertProvider(null);
    }

    // Production Project ID Validation: Ensure missing FIREBASE_PROJECT_ID in production throws
    const prevEnv = process.env.NODE_ENV;
    const prevProjectId = process.env.FIREBASE_PROJECT_ID;
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.FIREBASE_PROJECT_ID;
      let didThrow = false;
      try {
        getExpectedProjectId();
      } catch (err: any) {
        didThrow = true;
      }
      assert(didThrow === true, 'Production strictly requires FIREBASE_PROJECT_ID and throws if missing');
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevProjectId) process.env.FIREBASE_PROJECT_ID = prevProjectId;
      else delete process.env.FIREBASE_PROJECT_ID;
      if (prevGeminiKey) process.env.GEMINI_API_KEY = prevGeminiKey;
      else delete process.env.GEMINI_API_KEY;
    }
  }

  // 8. Closed-Loop Event Bus & Student State Engine
  console.log('\n[8] Closed-Loop Event Bus & Student State Engine');
  {
    const testUid = `student_loop_${Date.now()}`;
    const manager1 = getStudentStateManager(testUid, 'Basic');
    const manager2 = getStudentStateManager(testUid, 'Basic');
    assert(manager1 === manager2, 'getStudentStateManager returns singleton instance');

    let notifiedState: any = null;
    const unsubscribe = manager1.subscribe((state) => {
      notifiedState = state;
    });

    // Emit event through global event bus as would occur during exercises/quizzes
    eventBus.emit('EXERCISE_ANSWERED', testUid, {
      subject: 'math',
      topic: 'basic_algebra',
      conceptId: 'basic_algebra',
      isCorrect: true,
      responseTimeMs: 3500,
      difficulty: 'easy',
    });

    assert(notifiedState !== null, 'Subscriber was notified of state update from eventBus');
    assert(
      notifiedState?.conceptMastery['basic_algebra']?.attempts === 1 &&
      notifiedState?.conceptMastery['basic_algebra']?.correct === 1,
      'EventBus emission successfully updated conceptMastery in StudentStateManager'
    );

    // Test learning strain progression via consecutive errors and high latency
    eventBus.emit('EXERCISE_ANSWERED', testUid, {
      subject: 'math',
      topic: 'basic_algebra',
      conceptId: 'basic_algebra',
      isCorrect: false,
      responseTimeMs: 18000,
      difficulty: 'medium',
      mistakeType: 'sign_error',
    });
    eventBus.emit('EXERCISE_ANSWERED', testUid, {
      subject: 'math',
      topic: 'basic_algebra',
      conceptId: 'basic_algebra',
      isCorrect: false,
      responseTimeMs: 22000,
      difficulty: 'medium',
      mistakeType: 'sign_error',
    });

    assert(
      notifiedState.learningStrain.possibleStruggle >= 0.5,
      'Consecutive errors and high latency increase learning strain'
    );
    assert(
      notifiedState.learningStrain.signals.includes('repeated_errors') &&
      notifiedState.learningStrain.signals.includes('high_response_latency'),
      'Strain signals detect repeated_errors and high_response_latency'
    );

    unsubscribe();
    manager1.destroy();
  }

  // 9. AI Persona Generation & Active Intervention Directives
  console.log('\n[9] AI Persona Generation & Active Intervention Directives');
  {
    const mockProfile = {
      level: 'Basic',
      role: 'Student',
      field: 'Computer Science',
      accessibilityMode: 'Visual',
      studentState: {
        activePedagogy: 'worked_example' as const,
        learningStrain: {
          possibleStruggle: 0.8,
          confidence: 0.9,
          signals: ['repeated_errors', 'high_response_latency'],
        },
        activeInterventions: {
          dynamic_memory: {
            conceptId: 'dynamic_memory',
            strategy: 'worked_example',
            action: 'review_prerequisite',
            reason: 'Weak foundation in pointers',
            recommendedAction: 'review_prerequisite',
          },
        },
      },
    };

    const persona = buildPersona(mockProfile as any);
    assert(persona.includes('ACTIVE INTERVENTION DIRECTIVE:'), 'Persona includes ACTIVE INTERVENTION DIRECTIVE');
    assert(persona.includes('Strategy: worked_example'), 'Persona specifies worked_example strategy');
    assert(persona.includes('IDENTITY & DEVELOPER / CREATOR ATTRIBUTION'), 'Persona includes developer attribution section');
    assert(persona.includes('فريق تطوير منصة كوجنيفاي'), 'Persona attributes development to Cognify team in Arabic');
    assert(persona.includes('The Cognify Team / Graduation Project Team'), 'Persona attributes development to Cognify team in English');
    assert(persona.includes('NEVER say or imply that you were made, developed, or built by Google engineers'), 'Persona prohibits claiming Google made Cognify');
    assert(persona.includes('USER IS BLIND'), 'Preserves accessibility instructions for Visual mode');
  }

  // 10. Deterministic AI Router with Student State Strain
  console.log('\n[10] Deterministic AI Router with Student State Strain');
  {
    // Fast route for normal short queries without strain
    const r1 = classifyRequest('What is a loop?', []);
    assert(r1 === 'fast', 'Short concept question routes to fast model');

    // Code block routes to reasoning
    const r2 = classifyRequest('How to fix this? ```python\nx = 1\n```', []);
    assert(r2 === 'reasoning', 'Code block routes to reasoning model');

    // High learning strain forces reasoning model even for short queries
    const r3 = classifyRequest('What is a loop?', [], {
      activePedagogy: 'scaffolded',
      learningStrain: { possibleStruggle: 0.8 },
    });
    assert(r3 === 'reasoning', 'High learning strain (>=0.7) deterministically routes to reasoning model');

    // Active worked_example pedagogy forces reasoning model
    const r4 = classifyRequest('Help with dynamic memory', [], {
      activePedagogy: 'worked_example',
      learningStrain: { possibleStruggle: 0.3 },
    });
    assert(r4 === 'reasoning', 'worked_example pedagogy deterministically routes to reasoning model');

    // Image attachment always routes to vision
    const r5 = classifyRequest('Help me', [{ type: 'image/png' }]);
    assert(r5 === 'vision', 'Image attachment routes to vision model');
  }

  // 11. Concept Detection from Natural Language
  console.log('\n[11] Concept Detection from Natural Language');
  {
    const c1 = detectConceptFromText('I am confused about pointers and addresses');
    assert(c1?.id === 'pointers', 'Detects pointers concept from English text');

    const c2 = detectConceptFromText('عايز أفهم الجبر والمعادلات الرياضية');
    assert(c2?.id === 'basic_algebra', 'Detects basic_algebra concept from Arabic text');

    const c3 = detectConceptFromText('What is the capital of France?');
    assert(c3 === null, 'Returns null for unrelated queries');
  }

  // 12. Spatial Memory Engine & Multi-User Isolation
  console.log('\n[12] Spatial Memory Engine & Multi-User Isolation');
  {
    // Extraction from English vision description
    const enText = 'In front of you on the wooden table, there is a black TV remote on the right side, and a cup on the desk.';
    const extractedEn = extractSpatialObjectsFromVision(enText, 'user_alice', 'en');
    assert(extractedEn.length >= 2, 'Extracts multiple spatial objects from English vision text');
    const remoteEn = extractedEn.find((e) => e.category === 'remote');
    assert(
      !!remoteEn && remoteEn.surface?.toLowerCase() === 'table' && remoteEn.relativePosition?.direction === 'right',
      'English extraction captures category, surface, and relative direction'
    );

    // Extraction from Arabic vision description
    const arText = 'أمامي على الترابيزة ريموت التلفزيون ناحية اليمين وفي الصالة مفاتيح على المكتب.';
    const extractedAr = extractSpatialObjectsFromVision(arText, 'user_alice', 'ar');
    assert(extractedAr.length >= 1, 'Extracts spatial objects from Arabic vision text');
    const remoteAr = extractedAr.find((e) => e.category === 'remote');
    assert(!!remoteAr && remoteAr.category === 'remote', 'Arabic extraction accurately resolves category for remote');

    // Extraction from French vision description
    const frText = 'Sur la table se trouve une télécommande sur la droite et des clés.';
    const extractedFr = extractSpatialObjectsFromVision(frText, 'user_alice', 'fr');
    assert(extractedFr.length >= 1, 'Extracts spatial objects from French vision text');
    const remoteFr = extractedFr.find((e) => e.category === 'remote');
    assert(!!remoteFr && remoteFr.category === 'remote', 'French extraction accurately resolves category for remote');

    // Multi-User Isolation: User A objects cannot be accessed by User B
    const userA = 'student_isolated_alpha';
    const userB = 'student_isolated_beta';

    const objA: any = {
      id: 'obj_alpha_1',
      uid: userA,
      category: 'keys',
      objectName: 'House Keys',
      surface: 'coffee table',
      room: 'living room',
      relativePosition: { direction: 'left' },
      lastSeenTimestamp: Date.now(),
      lastSeenIso: new Date().toISOString(),
      confidence: 0.95,
    };
    await saveSpatialObject(userA, objA);

    const memoryA = getSpatialObjects(userA);
    const memoryB = getSpatialObjects(userB);

    assert(memoryA.some((m) => m.category === 'keys'), "User A has access to User A's stored spatial object");
    assert(!memoryB.some((m) => m.category === 'keys'), "User B cannot see or access User A's spatial objects (Strict Multi-User Isolation)");

    // Location history transition
    const movedObjA: any = {
      ...objA,
      surface: 'kitchen counter',
      room: 'kitchen',
      lastSeenTimestamp: Date.now() + 1000,
    };
    await saveSpatialObject(userA, movedObjA);
    const updatedA = getSpatialObjects(userA).find((m) => m.category === 'keys');
    assert(updatedA?.surface === 'kitchen counter', 'Object surface updated to new location');
    assert(Array.isArray(updatedA?.history) && updatedA.history.length === 1, 'Location history records previous surface on move');
    assert(updatedA?.history?.[0]?.surface === 'coffee table', 'History contains coffee table as previous location');

    // Epistemic honesty in querySpatialMemory
    const freshQuery = querySpatialMemory(userA, 'Where are my keys?', 'en');
    assert(freshQuery.found === true && freshQuery.message.includes('kitchen counter'), 'Spatial query successfully finds remembered object');
    assert(!freshQuery.message.includes('Note: Since some time has passed'), 'Recent observation does not include stale time disclaimer');

    // Stale object query (> 20 minutes ago) includes epistemic disclaimer
    const staleObjA: any = {
      ...objA,
      category: 'remote',
      objectName: 'TV Remote',
      surface: 'sofa',
      lastSeenTimestamp: Date.now() - 30 * 60 * 1000, // 30 mins ago
    };
    await saveSpatialObject(userA, staleObjA);
    const staleQueryEn = querySpatialMemory(userA, 'Where is the remote?', 'en');
    assert(
      staleQueryEn.found === true && staleQueryEn.message.includes('Note: Since some time has passed'),
      'Epistemic honesty: Stale observation (> 20 min) includes time disclaimer in English'
    );

    const staleQueryAr = querySpatialMemory(userA, 'فين ريموت التلفزيون؟', 'ar');
    assert(
      staleQueryAr.found === true && staleQueryAr.message.includes('ملاحظة: نظراً لمرور بعض الوقت'),
      'Epistemic honesty: Stale observation includes time disclaimer in Arabic'
    );

    const staleQueryFr = querySpatialMemory(userA, 'Où est la télécommande ?', 'fr');
    assert(
      staleQueryFr.found === true && staleQueryFr.message.includes("Remarque : Du temps s'étant écoulé"),
      'Epistemic honesty: Stale observation includes time disclaimer in French'
    );
  }

  // 13. French First-Class Language Integration & AI Prompts
  console.log('\n[13] French First-Class Language Integration & AI Prompts');
  {
    // Translations test
    const frTitle = localize('French', 'spatial_memory');
    assert(frTitle === 'Mémoire spatiale', 'localize resolves French translation for spatial_memory');

    const frWhere = localize('French', 'where_is_my_stuff');
    assert(frWhere === 'Où sont mes affaires ?', 'localize resolves French translation for where_is_my_stuff');

    // Also supports 'fr' code
    const frShort = localize('fr', 'spatial_memory');
    assert(frShort === 'Mémoire spatiale', 'localize resolves "fr" language code');

    // AI persona building for French
    const frenchProfile = {
      level: 'Intermediate',
      role: 'Student',
      field: 'Computer Science',
      language: 'French',
      accessibilityMode: 'None',
      spatialMemories: [
        {
          category: 'remote',
          objectName: 'Télécommande',
          surface: 'table du salon',
          room: 'salon',
          lastSeenIso: new Date().toISOString(),
        },
      ],
    };

    const frenchPersona = buildPersona(frenchProfile as any);
    assert(
      frenchPersona.includes('French in → reply in natural, fluent, idiomatic French'),
      'Persona includes French language mirroring instruction'
    );
    assert(frenchPersona.includes('FRANCE TRAVEL & SPOKEN FRENCH ASSISTANCE'), 'Persona includes France Travel & Spoken French assistance section');
    assert(frenchPersona.includes('Bonjour Madame'), 'Persona includes essential French politeness guidance');
    assert(frenchPersona.includes('phonetic pronunciation guide'), 'Persona includes phonetic pronunciation directives for traveler');
    assert(frenchPersona.includes('COGNIFY SPATIAL MEMORY'), 'Persona includes Spatial Memory context block');
    assert(frenchPersona.includes('Télécommande: on table du salon'), 'Persona formats remembered physical objects in spatial block');

    // Access control verification for France Travel Voice
    const normalUser = { uid: 'u1', accountPath: 'Normal' as const };
    const a11yUser = { uid: 'u2', accountPath: 'Special Needs' as const, accessibilityMode: 'Visual' };
    assert(canAccessView(normalUser as any, 'france', false) === true, 'Normal user can access France Travel Voice');
    assert(canAccessView(a11yUser as any, 'france', false) === true, 'Accessibility user can access France Travel Voice');
  }

  // 14. Multi-Language & Disability System Localization (All 11 Languages)
  console.log('\n[14] Multi-Language & Disability System Localization (All 11 Languages)');
  {
    // French disability modes and actions
    assert(localize('French', '⚡ Motor & Euphonia') === '⚡ Moteur & Euphonia', 'French: ⚡ Motor & Euphonia');
    assert(localize('French', '👁️ Visual Companion') === '👁️ Compagnon Visuel', 'French: 👁️ Visual Companion');
    assert(localize('French', '🤖 AI Sign Studio') === '🤖 Studio LSF par IA', 'French: 🤖 AI Sign Studio');
    assert(localize('French', '🤝 Two-Way Bridge') === '🤝 Passerelle de Communication', 'French: 🤝 Two-Way Bridge');
    assert(localize('French', '💬 Text Chat') === '💬 Discussion Textuelle', 'French: 💬 Text Chat');

    // Multi-language coverage for other supported languages
    assert(localize('Spanish', '⚡ Motor & Euphonia') === '⚡ Motor y Euphonia', 'Spanish: ⚡ Motor & Euphonia');
    assert(localize('German', '⚡ Motor & Euphonia') === '⚡ Motorik & Euphonia', 'German: ⚡ Motor & Euphonia');
    assert(localize('Italian', '⚡ Motor & Euphonia') === '⚡ Motorio ed Euphonia', 'Italian: ⚡ Motor & Euphonia');
    assert(localize('Russian', '⚡ Motor & Euphonia') === '⚡ Моторный и Euphonia', 'Russian: ⚡ Motor & Euphonia');
    assert(localize('Chinese', '⚡ Motor & Euphonia') === '⚡ 运动与 Euphonia', 'Chinese: ⚡ Motor & Euphonia');
    assert(localize('Japanese', '⚡ Motor & Euphonia') === '⚡ モーター＆Euphonia', 'Japanese: ⚡ Motor & Euphonia');

    // Language code alias resolution (fr, es, de, it, pt, ru, zh, ja)
    assert(localize('es', '⚡ Motor & Euphonia') === '⚡ Motor y Euphonia', 'Alias "es" resolves to Spanish');
    assert(localize('de', '⚡ Motor & Euphonia') === '⚡ Motorik & Euphonia', 'Alias "de" resolves to German');
    assert(localize('zh', '⚡ Motor & Euphonia') === '⚡ 运动与 Euphonia', 'Alias "zh" resolves to Chinese');

    // Arabic & Egyptian Ammiya RTL fallback preservation
    assert(localize('Arabic', 'Hello', 'مرحبا') === 'مرحبا', 'Arabic returns Arabic fallback text');
    assert(localize('Egyptian Ammiya', 'Hello', 'أهلا') === 'أهلا', 'Egyptian Ammiya returns Arabic fallback text');

    // AI persona incorporates configured user language
    const profileSpanish = { level: 'Advanced', language: 'Spanish', accessibilityMode: 'None' };
    const personaSpanish = buildPersona(profileSpanish as any);
    assert(personaSpanish.includes('Configured Language: Spanish'), 'Persona includes Configured Language for Spanish');

    const profileFrench = { level: 'Advanced', language: 'French', accessibilityMode: 'None' };
    const personaFrench = buildPersona(profileFrench as any);
    assert(personaFrench.includes('Configured Language: French'), 'Persona includes Configured Language for French');
  }

  // 15. Super Admin Database Hub & Security Inspect Tracker
  console.log('\n[15] Super Admin Database Hub & Security Inspect Tracker');
  {
    // Database Health check
    const health = await getDatabaseHealth();
    assert(health.region === 'Frankfurt (europe-west1)', 'Database health returns Frankfurt europe-west1 region');
    assert(health.latencyMs >= 0, 'Database health returns non-negative latency in ms');
    assert(health.status === 'healthy' || health.status === 'degraded', 'Database health returns valid status');

    // Collection stats estimation
    const stats = getCollectionStats(100);
    assert(stats.usersCount === 100, 'Collection stats tracks 100 users correctly');
    assert(stats.estimatedChatThreads > 100, 'Estimated chat threads scales proportionally with users');
    assert(stats.estimatedStorageKb > 0, 'Estimated storage footprint calculated');

    // Full system backup generation
    const mockUsers: any[] = [{ uid: 'test-1', email: 'test@cognify.app', points: 150 }];
    const backup = generateFullSystemBackupJson(mockUsers as any, []);
    assert(backup.filename.includes('backup-') && backup.filename.endsWith('.json'), 'Backup generates timestamped filename');
    assert((backup.jsonString || '').includes('Cognify'), 'Backup contains system metadata header');
    assert((backup.jsonString || '').includes('test@cognify.app'), 'Backup contains user records');

    // Stale session & cache cleaner
    const cleanup = await cleanStaleSessionsAndCache();
    assert(typeof cleanup.cleanedKeys === 'number' && cleanup.cleanedKeys >= 0, 'Clean stale sessions runs safely');

    // Security tracker IP resolution
    const ip = await resolveClientIp();
    assert(typeof ip === 'string' && ip.length > 0, 'resolveClientIp returns valid non-empty string');

    // Database Dashboard zone active check
    assert(typeof isDatabaseDashboardActive() === 'boolean', 'isDatabaseDashboardActive returns boolean');
    assert(typeof isTargetInsideDatabaseDashboard(null) === 'boolean', 'isTargetInsideDatabaseDashboard handles null target');

    // Security event logger
    const testRecord = await logSecurityEvent(
      { uid: 'admin-1', email: 'admin@cognify.app', isAdmin: true },
      'devtools_inspect_shortcut',
      'Test F12 inspect event'
    );
    assert(testRecord !== null && testRecord.role === 'Admin', 'logSecurityEvent properly logs admin security record');
    assert(testRecord?.eventType === 'devtools_inspect_shortcut', 'logSecurityEvent correctly records event type');

    // Security event logger - right-click inspect detection with user identity
    const contextRecord = await logSecurityEvent(
      { uid: 'student-42', name: 'Sara Ahmed', email: 'sara@cognify.app', role: 'Student' },
      'contextmenu_inspect',
      'Right-click inspect/contextmenu opened on <button.send-btn> at (450, 620) on page #chat'
    );
    assert(contextRecord !== null && contextRecord.name === 'Sara Ahmed', 'logSecurityEvent captures user identity for right click inspect');
    assert(contextRecord?.details.includes('Right-click inspect/contextmenu opened'), 'logSecurityEvent captures inspect trigger details');

    // Security event logger - DevTools docked window detection inside Database Dashboard
    const dockRecord = await logSecurityEvent(
      { uid: 'student-99', name: 'Karim Tarek', email: 'karim@cognify.app', role: 'Student' },
      'devtools_opened',
      'CRITICAL: DevTools docked window opened while inside Database Dashboard! (delta: 320px x 400px)'
    );
    assert(dockRecord !== null && dockRecord.email === 'karim@cognify.app', 'logSecurityEvent captures user who opened DevTools docked window');
    assert(dockRecord?.details.includes('Database Dashboard'), 'logSecurityEvent flags database dashboard security context');

    // Markdown audit report
    const report = generateDatabaseAuditReport(mockUsers as any, [testRecord, contextRecord, dockRecord]);
    assert(report.includes('Frankfurt (europe-west1)'), 'Audit report contains correct database region');
    assert(report.includes('Active User Accounts: 1') || report.includes('Registered Users: 1'), 'Audit report contains accurate user counts');
    assert(report.includes('Firebase Spark Plan (Free Tier) Quotas & Limits'), 'Audit report includes Spark Plan quotas section');

    // Firebase Spark Plan (Free Tier) Official Limits
    assert(FIRESTORE_SPARK_LIMITS.dailyReads === 50000, 'Spark limit: 50,000 daily Firestore reads');
    assert(FIRESTORE_SPARK_LIMITS.dailyWrites === 20000, 'Spark limit: 20,000 daily Firestore writes');
    assert(FIRESTORE_SPARK_LIMITS.dailyDeletes === 20000, 'Spark limit: 20,000 daily Firestore deletes');
    assert(FIRESTORE_SPARK_LIMITS.storageMb === 1024, 'Spark limit: 1,024 MB (1 GiB) database storage');
    assert(FIRESTORE_SPARK_LIMITS.monthlyEgressGb === 10, 'Spark limit: 10 GB monthly network egress');
    assert(FIRESTORE_SPARK_LIMITS.maxConcurrentConnections === 100, 'Spark limit: 100 concurrent connections');
    assert(FIRESTORE_SPARK_LIMITS.maxFreeAuthUsers === 50000, 'Spark limit: 50,000 free auth MAUs');
    assert(BACKEND_SPARK_LIMITS.vercelDailyInvocations === 100000, 'Backend limit: 100,000 daily serverless invocations');
    assert(BACKEND_SPARK_LIMITS.geminiDailyRequests === 1500, 'AI limit: 1,500 daily free Gemini requests');
    assert(BACKEND_SPARK_LIMITS.geminiMinuteRate === 15, 'AI limit: 15 Requests Per Minute (RPM)');

    // Quotas computation and status determination
    const quotas = getFirebaseFreeTierQuotas(25, 2, 10);
    assert(quotas.items.length === 10, 'Quotas generator produces all 10 tracked resource cards');
    assert(quotas.plan === 'Spark (Free Tier)', 'Quota plan marked as Spark Free Tier');
    assert(quotas.overallHealth === 'safe', 'Clean baseline quotas marked with overall safe health');
    const readsItem = quotas.items.find((i) => i.id === 'firestore_reads');
    assert(readsItem !== null && readsItem!.percentUsed >= 0 && readsItem!.percentUsed < 50, 'Firestore reads within safe threshold');
    const storageItem = quotas.items.find((i) => i.id === 'firestore_storage');
    assert(storageItem !== null && storageItem!.limit === 1024, 'Firestore storage limit is 1,024 MB');

    // HTTP / HTTPS Telemetry Tracker
    assert(categorizeUrl('/api/gemini/chat') === 'gemini', 'Categorizes /api/gemini endpoint as gemini');
    assert(categorizeUrl('/api/telemetry/securityAudit') === 'telemetry', 'Categorizes /api/telemetry endpoint as telemetry');
    assert(categorizeUrl('https://firestore.googleapis.com/v1/projects/demo') === 'firebase', 'Categorizes firestore googleapis as firebase');
    assert(categorizeUrl('https://fonts.googleapis.com/css2') === 'external', 'Categorizes external CDN as external');
    
    recordHttpRequest('/api/gemini/chat', 'POST', 200, 140);
    recordHttpRequest('/api/telemetry/securityAudit', 'POST', 200, 30);
    const metrics = getHttpMetrics();
    assert(metrics.todayRequests >= 2, 'HTTP Tracker records today request count');
    assert(metrics.byCategory.gemini >= 1, 'HTTP Tracker records Gemini category calls');
    assert(metrics.byCategory.telemetry >= 1, 'HTTP Tracker records Telemetry category calls');
  }

  // 16. Natural Conversational Spoken Audio & Anti-Boilerplate Sanitization
  console.log('\n[16] Natural Spoken Audio & Anti-Boilerplate Sanitization');
  {
    const rawEnglish = '**Hazards:** None detected in your immediate sitting space. **Visible Text:** None. **Scene Description:** - A man in a blue polo shirt is seated directly in front of the camera.';
    const cleanedEnglish = cleanForSpeech(rawEnglish);
    assert(!cleanedEnglish.includes('**'), 'Strips all markdown asterisks');
    assert(!cleanedEnglish.includes('Hazards:'), 'Strips robotic Hazards: header');
    assert(!cleanedEnglish.includes('Visible Text:'), 'Strips robotic Visible Text: header');
    assert(!cleanedEnglish.includes('Scene Description:'), 'Strips robotic Scene Description: header');
    assert(cleanedEnglish.startsWith('No hazards around you.'), 'Replaces Hazards: None with natural reassuring sentence');
    assert(cleanedEnglish.includes('A man in a blue polo shirt'), 'Preserves actual scene description');

    const rawArabic = '**المخاطر:** لا توجد أخطار واضحة في محيطك. **النصوص المكتوبة:** لا توجد. **وصف المشهد:** - شخص جالس يرتدي قميصاً أزرق.';
    const cleanedArabic = cleanForSpeech(rawArabic);
    assert(!cleanedArabic.includes('**'), 'Strips markdown asterisks from Arabic');
    assert(!cleanedArabic.includes('المخاطر:'), 'Strips Arabic المخاطر: header');
    assert(!cleanedArabic.includes('النصوص'), 'Strips Arabic النصوص header');
    assert(!cleanedArabic.includes('وصف المشهد'), 'Strips Arabic وصف المشهد header');
    assert(cleanedArabic.startsWith('مفيش أخطار حواليك.'), 'Replaces Arabic hazards none with friendly Egyptian greeting');
    assert(cleanedArabic.includes('شخص جالس'), 'Preserves actual Arabic content');

    const symbolArtifacts = 'Notice * this word and asterisk symbol نجمة and استريك';
    const cleanedSymbols = cleanForSpeech(symbolArtifacts);
    assert(!cleanedSymbols.includes('asterisk') && !cleanedSymbols.includes('استريك') && !cleanedSymbols.includes('نجمة'), 'Strips spoken symbol words like asterisk/استريك/نجمة');

    const markdownLink = 'Check out [Cognify Web](https://cognify.app) for details and ![alt](img.jpg).';
    const cleanedLink = cleanForSpeech(markdownLink);
    assert(cleanedLink.includes('Cognify Web') && !cleanedLink.includes('https://') && !cleanedLink.includes('img.jpg'), 'Strips markdown links/images and preserves link text');

    const codeLang = 'I can help you code in C++ and C# efficiently.';
    const cleanedCode = cleanForSpeech(codeLang);
    assert(cleanedCode.includes('C plus plus') && cleanedCode.includes('C sharp'), 'Preserves C++ and C# as spoken phrases');
  }

  // 17. Real-Time Active Presence & Profile Avatars
  console.log('\n[17] Real-Time Active Presence & Profile Avatars');
  {
    const now = new Date();
    const activeNowUser = {
      uid: 'user-active-1',
      name: 'Sarah Connor',
      email: 'sarah@cognify.app',
      lastActiveDate: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), // 2 min ago
      photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
    };

    const presenceActive = getUserPresenceStatus(activeNowUser as any);
    assert(presenceActive.status === 'online', 'User active within 2 minutes is flagged as online');
    assert(presenceActive.label === 'Active Now', 'Online user has "Active Now" label');
    assert(presenceActive.dotCls.includes('bg-emerald-400'), 'Online user gets pulsing emerald beacon');
    assert(isUserOnlineNow(activeNowUser as any) === true, 'isUserOnlineNow returns true for recent heartbeat');

    const awayUser = {
      uid: 'user-away-1',
      name: 'John Connor',
      email: 'john@cognify.app',
      lastActiveDate: new Date(now.getTime() - 12 * 60 * 1000).toISOString(), // 12 min ago
    };
    const presenceAway = getUserPresenceStatus(awayUser as any);
    assert(presenceAway.status === 'away', 'User active 12 minutes ago is flagged as away');
    assert(presenceAway.label.includes('12m ago'), 'Away user displays minutes ago');
    assert(isUserOnlineNow(awayUser as any) === false, 'isUserOnlineNow returns false for away user');

    const offlineUser = {
      uid: 'user-offline-1',
      name: 'Kyle Reese',
      email: 'kyle@cognify.app',
      lastActiveDate: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(), // 3 hours ago
    };
    const presenceOffline = getUserPresenceStatus(offlineUser as any);
    assert(presenceOffline.status === 'offline', 'User active 3 hours ago is flagged as offline');
    assert(presenceOffline.label === '3h ago', 'Offline user displays relative time (3h ago)');

    const neverActiveUser = {
      uid: 'user-new-1',
      name: 'New Student',
      email: 'new@cognify.app',
    };
    const presenceNever = getUserPresenceStatus(neverActiveUser as any);
    assert(presenceNever.status === 'offline', 'Never active user is flagged as offline');
    assert(presenceNever.label === 'Never Active', 'Never active user has "Never Active" label');

    // Clock skew / future date protection
    const futureUser = {
      uid: 'user-future-1',
      name: 'Doc Brown',
      email: 'doc@future.org',
      lastActiveDate: new Date(now.getTime() + 2 * 3600 * 1000).toISOString(), // 2 hours in the future
    };
    const presenceFuture = getUserPresenceStatus(futureUser as any);
    assert(presenceFuture.status === 'offline', 'User with future date (clock skew) safely returns offline');

    // Corrupted non-array chatThreads safety
    const corruptUser = {
      uid: 'user-corrupt-1',
      name: 'Glitch',
      chatThreads: { corrupted: true } as any,
    };
    const presenceCorrupt = getUserPresenceStatus(corruptUser as any);
    assert(presenceCorrupt.status === 'offline', 'Corrupted non-array chatThreads safely returns offline without crashing');

    // Null user safety
    const presenceNull = getUserPresenceStatus(null);
    assert(presenceNull.status === 'offline', 'Null user safely returns offline');
  }

  // 18. Prerequisite Gap Diagnosis & Null Safety
  console.log('\n[18] Prerequisite Gap Diagnosis & Role Safety');
  {
    // Null user safety in isAdminUser
    assert(isAdminUser(null) === false, 'isAdminUser(null) safely returns false');
    assert(isAdminUser(undefined) === false, 'isAdminUser(undefined) safely returns false');
    assert(isAdminUser({ email: 'modyhashim2006@gmail.com' }) === true, 'isAdminUser recognizes founder super admin');

    // Prerequisite gap detection
    const diagnosis = diagnosePrerequisiteGap('dynamic_memory', {
      pointers: { accuracy: 0.35, attempts: 3, confidence: 0.2 },
    });
    assert(diagnosis.hasPrerequisiteGap === true, 'Diagnoses gap when foundational prerequisite has low mastery');
    assert(diagnosis.rootGapConcept?.id === 'pointers', 'Identifies root gap concept for weak prerequisite');

    // Inspect Tracker Security Audit Owner Isolation (strictly restricted to modyhashim2006@gmail.com)
    assert(isSecurityAuditsOwner('modyhashim2006@gmail.com') === true, 'isSecurityAuditsOwner recognizes primary founder account');
    assert(isSecurityAuditsOwner('MODYHASHIM2006@GMAIL.COM') === true, 'isSecurityAuditsOwner handles case-insensitive emails');
    assert(isSecurityAuditsOwner('mariemsayedr33@gmail.com') === false, 'isSecurityAuditsOwner rejects other super admins');
    assert(isSecurityAuditsOwner('pro.mahmoud.h@gmail.com') === false, 'isSecurityAuditsOwner rejects other founder super admins');
    assert(isSecurityAuditsOwner('marwaneltaweel0@gmail.com') === false, 'isSecurityAuditsOwner rejects permanent admins');
    assert(isSecurityAuditsOwner('other@gmail.com') === false, 'isSecurityAuditsOwner rejects standard users');
    assert(isSecurityAuditsOwner(undefined) === false, 'isSecurityAuditsOwner handles undefined gracefully');
    assert(isSecurityAuditsOwner('') === false, 'isSecurityAuditsOwner handles empty string gracefully');

    // Database Hub Owner Isolation (strictly restricted to modyhashim2006@gmail.com)
    assert(isDatabaseHubOwner('modyhashim2006@gmail.com') === true, 'isDatabaseHubOwner recognizes primary founder account');
    assert(isDatabaseHubOwner('MODYHASHIM2006@GMAIL.COM') === true, 'isDatabaseHubOwner handles case-insensitive emails');
    assert(isDatabaseHubOwner('mariemsayedr33@gmail.com') === false, 'isDatabaseHubOwner rejects other super admins');
    assert(isDatabaseHubOwner('pro.mahmoud.h@gmail.com') === false, 'isDatabaseHubOwner rejects other founder super admins');
    assert(isDatabaseHubOwner('marwaneltaweel0@gmail.com') === false, 'isDatabaseHubOwner rejects permanent admins');
    assert(isDatabaseHubOwner('other@gmail.com') === false, 'isDatabaseHubOwner rejects standard users');
    assert(isDatabaseHubOwner(undefined) === false, 'isDatabaseHubOwner handles undefined gracefully');
    assert(isDatabaseHubOwner('') === false, 'isDatabaseHubOwner handles empty string gracefully');
  }

  // 19. Crypto Shield & Credential Encryption
  console.log('\n[19] Crypto Shield & Credential Encryption');
  {
    const sampleKey = 'AIzaSy_demo_gemini_key_sec_4892014';
    const encrypted = encryptSecretSync(sampleKey);

    assert(encrypted.startsWith('enc:v1:'), 'Encrypted string begins with enc:v1: shield prefix');
    assert(isEncryptedSecret(encrypted) === true, 'isEncryptedSecret returns true for shielded string');
    assert(isEncryptedSecret(sampleKey) === false, 'isEncryptedSecret returns false for plaintext string');
    assert(isEncryptedSecret('') === false, 'isEncryptedSecret returns false for empty input');
    assert(isEncryptedSecret(null) === false, 'isEncryptedSecret returns false for null input');

    // Decryption round-trip
    const decrypted = decryptSecretSync(encrypted);
    assert(decrypted === sampleKey, 'Decrypted key perfectly matches original plaintext');

    // Backward compatibility for legacy plaintext
    const legacyKey = 'AIzaSy_legacy_plaintext_key';
    const passThrough = decryptSecretSync(legacyKey);
    assert(passThrough === legacyKey, 'Legacy plaintext string passes through decrypt untouched');

    // Corrupt payload safety
    const corrupted = encrypted.slice(0, -6) + '001122';
    const corruptDecrypted = decryptSecretSync(corrupted);
    assert(corruptDecrypted === '', 'Corrupt or tampered ciphertext safely returns empty string without crashing');

    // Save, Load, Remove Key flow
    await secureSaveKey('gemini', sampleKey);
    const loaded = secureLoadKeySync('gemini');
    assert(loaded === sampleKey, 'secureLoadKeySync loads decrypted key from cache/storage');

    secureRemoveKey('gemini');
    const removed = secureLoadKeySync('gemini');
    assert(removed === '', 'secureRemoveKey removes key from cache and storage');
  }

  // 20. Multimodal Media & PDF Document Processing
  console.log('\n[20] Multimodal Media & PDF Document Processing');
  {
    // Router classification for images and PDFs
    const imageAttachment = [{ type: 'image/png', name: 'screenshot.png' }];
    const imageCategory = classifyRequest('Explain this diagram', imageAttachment);
    assert(imageCategory === 'vision', 'Image attachment routes to vision category');

    const pdfAttachment = [{ type: 'application/pdf', name: 'lecture_notes.pdf' }];
    const pdfCategory = classifyRequest('Summarize this document', pdfAttachment);
    assert(pdfCategory === 'vision', 'PDF attachment routes to vision category');

    const pdfByNameOnly = [{ type: '', name: 'algorithm_analysis.pdf' }];
    const pdfByNameCategory = classifyRequest('Find bugs in this paper', pdfByNameOnly);
    assert(pdfByNameCategory === 'vision', 'PDF identified by filename routes to vision category');

    // buildContents structure verification for Gemini inlineData
    const dummyBase64 = 'JVBERi0xLjQKJcTl8uXr...';
    const sampleAttachments = [
      { name: 'document.pdf', type: 'application/pdf', data: `data:application/pdf;base64,${dummyBase64}` },
      { name: 'photo.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...' },
    ];
    const contents = buildContents('Analyze these files', [], sampleAttachments);
    const userTurn = contents.find((c: any) => c.role === 'user');
    assert(!!userTurn, 'buildContents creates valid user turn');

    const inlineParts = userTurn?.parts?.filter((p: any) => p.inlineData) || [];
    assert(inlineParts.length === 2, 'buildContents generates exactly 2 inlineData attachments');
    assert(inlineParts[0]?.inlineData?.mimeType === 'application/pdf', 'First attachment has application/pdf MIME type');
    assert(inlineParts[0]?.inlineData?.data === dummyBase64, 'Stripped data URL prefix leaving clean base64 data');
    assert(inlineParts[1]?.inlineData?.mimeType === 'image/jpeg', 'Second attachment has image/jpeg MIME type');
  }

  // 21. Unified Student State Engine & Firestore Persistence
  console.log('\n[21] Unified Student State Engine & Firestore Persistence');
  {
    // Initial student state baseline
    const initial = createInitialStudentState('test_student_1', 'Intermediate');
    assert(initial.uid === 'test_student_1', 'Initial student state preserves UID');
    assert(initial.activePedagogy === 'scaffolded', 'Default initial pedagogy is scaffolded');
    assert(initial.struggleSignal === 0.2, 'Initial baseline struggle signal is 0.2');
    assert(initial.totalExercisesCompleted === 0, 'Initial exercise count is 0');

    // Guest detection safety
    assert(isGuestUser(null), 'isGuestUser handles null');
    assert(isGuestUser(undefined), 'isGuestUser handles undefined');
    assert(isGuestUser('guest'), 'isGuestUser recognizes guest');
    assert(isGuestUser('anonymous'), 'isGuestUser recognizes anonymous');
    assert(isGuestUser('demo'), 'isGuestUser recognizes demo');
    assert(!isGuestUser('user_482910'), 'isGuestUser recognizes real authenticated UID');

    // Guest manager initialization bypasses network calls and marks loaded immediately
    const guestManager = getStudentStateManager('guest');
    assert(guestManager.loaded === true, 'Guest manager loaded is true immediately');
    assert(guestManager.getState().uid === 'guest', 'Guest manager maintains guest state');

    // Closed-loop answer tracking
    const result1 = guestManager.recordAnswer('fractions_addition', true, 3500);
    assert(result1.state.conceptMastery.fractions_addition.attempts === 1, 'Records first attempt count');
    assert(result1.state.conceptMastery.fractions_addition.correct === 1, 'Records first correct count');
    assert(result1.state.conceptMastery.fractions_addition.accuracy === 1.0, 'Calculates 100% accuracy');
    assert(result1.state.conceptMastery.fractions_addition.confidence > 0.5, 'Increases confidence on success');

    // Latency and repeated error detection
    const resultStruggle = guestManager.recordAnswer('calculus_limits', false, 19000, 'sign_flip');
    assert(resultStruggle.state.learningStrain.signals.includes('high_response_latency'), 'Detects high response latency struggle signal');

    const resultRepeatErr = guestManager.recordAnswer('calculus_limits', false, 4000, 'sign_flip');
    assert(resultRepeatErr.state.conceptMastery.calculus_limits.consecutiveIncorrect >= 2, 'Tracks consecutive incorrect answers');
    assert(resultRepeatErr.state.learningStrain.signals.includes('repeated_errors'), 'Detects repeated errors struggle signal');

    // Flush safety
    await guestManager.flushPendingWrites();
    assert(true, 'flushPendingWrites executes safely without throwing on guest sessions');
  }

  // 22. Persistent Learning Event Store & State Projection
  console.log('\n[22] Persistent Learning Event Store & State Projection');
  {
    // Event creation and bus emission
    let capturedEvent: any = null;
    const unsub = eventBus.on('EXERCISE_ANSWERED', (ev) => {
      capturedEvent = ev;
    });

    eventBus.emit('EXERCISE_ANSWERED', 'student_proj_test', {
      subject: 'Math',
      topic: 'quadratic_equations',
      conceptId: 'quadratic_equations',
      isCorrect: true,
      responseTimeMs: 4200,
      difficulty: 'medium',
    });

    assert(capturedEvent !== null, 'eventBus delivers EXERCISE_ANSWERED event to listener');
    assert(capturedEvent.uid === 'student_proj_test', 'Event preserves student UID');
    assert(capturedEvent.type === 'EXERCISE_ANSWERED', 'Event preserves event type');
    unsub();

    // Guest history safely retrieves without Firestore error
    const guestHistory = await getLearningEventHistory('guest');
    assert(Array.isArray(guestHistory), 'getLearningEventHistory returns array for guest');

    // Deterministic state reconstruction from events (projectEventsToState)
    const historicalEvents: any[] = [
      {
        id: 'ev_1',
        type: 'EXERCISE_ANSWERED',
        uid: 'proj_learner_42',
        timestamp: 1000,
        payload: {
          conceptId: 'linear_algebra_vectors',
          isCorrect: true,
          responseTimeMs: 3000,
          difficulty: 'easy',
        },
      },
      {
        id: 'ev_2',
        type: 'EXERCISE_ANSWERED',
        uid: 'proj_learner_42',
        timestamp: 2000,
        payload: {
          conceptId: 'linear_algebra_vectors',
          isCorrect: true,
          responseTimeMs: 2500,
          difficulty: 'medium',
        },
      },
      {
        id: 'ev_3',
        type: 'EXERCISE_ANSWERED',
        uid: 'proj_learner_42',
        timestamp: 3000,
        payload: {
          conceptId: 'linear_algebra_matrices',
          isCorrect: false,
          responseTimeMs: 18000,
          mistakeType: 'dimension_mismatch',
          difficulty: 'hard',
        },
      },
      {
        id: 'ev_4',
        type: 'EXERCISE_ANSWERED',
        uid: 'proj_learner_42',
        timestamp: 4000,
        payload: {
          conceptId: 'linear_algebra_matrices',
          isCorrect: false,
          responseTimeMs: 4500,
          mistakeType: 'dimension_mismatch',
          difficulty: 'hard',
        },
      },
    ];

    const projectedState = projectEventsToState(historicalEvents, 'proj_learner_42', 'Advanced');
    assert(projectedState.uid === 'proj_learner_42', 'projectEventsToState sets correct UID');
    assert(projectedState.totalExercisesCompleted === 4, 'Projects exact total exercise count');
    assert(projectedState.conceptMastery.linear_algebra_vectors.correct === 2, 'Projects vector mastery correct count');
    assert(projectedState.conceptMastery.linear_algebra_vectors.accuracy === 1.0, 'Projects vector mastery 100% accuracy');
    assert(projectedState.conceptMastery.linear_algebra_matrices.consecutiveIncorrect === 2, 'Projects consecutive incorrect answers');
    assert(projectedState.learningStrain.signals.includes('repeated_errors'), 'Reconstructs repeated_errors strain signal');
    assert(projectedState.lastActiveTimestamp === 4000, 'Reconstructs accurate lastActiveTimestamp');
  }

  // 23. Feedback Intelligence & Pedagogy Adaptation
  console.log('\n[23] Feedback Intelligence & Pedagogy Adaptation');
  {
    const fbManager = getStudentStateManager('feedback_test_student');
    const initialState = fbManager.getState();
    assert(initialState.activePedagogy === 'scaffolded', 'Initial active pedagogy is scaffolded');
    const initialScaffoldScore = initialState.pedagogyEffectiveness.scaffolded.score;

    // Positive feedback increases strategy effectiveness score
    fbManager.recordPedagogyFeedback('scaffolded', true, 'concept_test');
    const boostedState = fbManager.getState();
    assert(
      boostedState.pedagogyEffectiveness.scaffolded.score > initialScaffoldScore,
      'Helpful feedback increases strategy score'
    );
    assert(
      boostedState.pedagogyEffectiveness.scaffolded.helpfulCount === 1,
      'Increments helpfulCount counter'
    );

    // Negative feedback on active strategy triggers automated adaptation to best alternative
    fbManager.recordPedagogyFeedback('scaffolded', false, 'concept_test');
    fbManager.recordPedagogyFeedback('scaffolded', false, 'concept_test');
    const adaptedState = fbManager.getState();
    assert(
      adaptedState.activePedagogy !== 'scaffolded',
      'Unhelpful feedback on active pedagogy triggers auto-adaptation to best alternative'
    );
    assert(
      adaptedState.pedagogyEffectiveness.scaffolded.unhelpfulCount === 2,
      'Increments unhelpfulCount counter'
    );

    // Event bus delivers FEEDBACK_RECORDED to persistent listeners
    let capturedFeedback: any = null;
    const unsubFb = eventBus.on('FEEDBACK_RECORDED', (ev) => {
      if (ev.payload?.messageId === 'msg_9821') {
        capturedFeedback = ev;
      }
    });

    eventBus.emit('FEEDBACK_RECORDED', 'feedback_test_student', {
      messageId: 'msg_9821',
      pedagogyUsed: 'analogies',
      helpful: true,
      conceptId: 'photosynthesis',
    });

    assert(capturedFeedback !== null, 'FEEDBACK_RECORDED event received by event bus subscribers');
    unsubFb();
  }

  // 24. Multi-User Spatial Memory Isolation & Epistemic Honesty
  console.log('\n[24] Multi-User Spatial Memory Isolation & Epistemic Honesty');
  {
    const user1 = 'spatial_test_user_1';
    const user2 = 'spatial_test_user_2';

    // Save object for user 1
    await saveSpatialObject(user1, {
      id: 'sp_keys_1',
      uid: user1,
      objectName: 'House Keys',
      category: 'keys',
      confidence: 0.95,
      surface: 'wooden nightstand',
      room: 'master bedroom',
      lastSeenTimestamp: Date.now() - 60000,
      lastSeenIso: new Date(Date.now() - 60000).toISOString(),
      source: 'camera_auto',
      relativePosition: { direction: 'center', distance: 'near' },
    });

    // Save location update for user 1 (moving keys to entryway console table)
    await saveSpatialObject(user1, {
      id: 'sp_keys_1',
      uid: user1,
      objectName: 'House Keys',
      category: 'keys',
      confidence: 0.98,
      surface: 'entryway console table',
      room: 'hallway',
      lastSeenTimestamp: Date.now(),
      lastSeenIso: new Date().toISOString(),
      source: 'user_confirmed',
      relativePosition: { direction: 'right', distance: 'near' },
    });

    const user1Objects = getSpatialObjects(user1);
    assert(user1Objects.length === 1, 'User 1 has 1 tracked spatial object');
    assert(user1Objects[0].surface === 'entryway console table', 'Updates to latest observed surface');
    assert((user1Objects[0].history?.length || 0) >= 1, 'Maintains previous location in history');

    // Strict Multi-User Isolation: User 2 must see 0 objects
    const user2Objects = getSpatialObjects(user2);
    assert(user2Objects.length === 0, 'User 2 spatial memory is completely isolated (0 objects)');

    // Epistemic honesty queries
    const queryEn = querySpatialMemory(user1, 'where did I put my keys?', 'en');
    assert(queryEn.found === true, 'querySpatialMemory finds keys in English');
    assert(queryEn.message.includes('entryway console table'), 'References accurate surface');

    const queryAr = querySpatialMemory(user1, 'فين المفاتيح؟', 'ar');
    assert(queryAr.found === true, 'querySpatialMemory finds keys in Arabic');
    assert(queryAr.message.includes('entryway console table'), 'Arabic response references correct location');

    const queryFr = querySpatialMemory(user1, 'où sont mes clés ?', 'fr');
    assert(queryFr.found === true, 'querySpatialMemory finds keys in French');
    assert(queryFr.message.includes('entryway console table'), 'French response references correct location');

    // Negative query (Unobserved item)
    const unobservedQuery = querySpatialMemory(user1, 'where is my medication?', 'en');
    assert(unobservedQuery.found === false, 'Truthfully reports unobserved object as not found');
    assert(unobservedQuery.message.includes("haven't observed this object"), 'Epistemically honest reassurance');

    // Cross-user leakage prevention
    const leakAttempt = querySpatialMemory(user2, 'where are my keys?', 'en');
    assert(leakAttempt.found === false, 'User 2 cannot query User 1 items');
  }

  // 25. Multi-Tenant Privacy & Data Boundary Isolation
  console.log('\n[25] Multi-Tenant Privacy & Data Boundary Isolation');
  {
    // Privacy Specification document existence
    const specPath = path.resolve('PRIVACY_SPECIFICATION.md');
    assert(fs.existsSync(specPath), 'PRIVACY_SPECIFICATION.md exists in project root');

    const specContent = fs.readFileSync(specPath, 'utf8');
    assert(specContent.includes('Zero-Knowledge Media Processing'), 'Spec documents Zero-Knowledge media processing');
    assert(specContent.includes('NEVER PERSISTED'), 'Spec guarantees camera and mic streams are never persisted');
    assert(specContent.includes('Strict Multi-Tenant Isolation'), 'Spec defines strict multi-tenant boundary rules');

    // Student state multi-tenant isolation
    const studentA = getStudentStateManager('tenant_student_A');
    const studentB = getStudentStateManager('tenant_student_B');

    studentA.recordAnswer('calculus_integrals', true, 4000);
    assert(studentA.getState().conceptMastery.calculus_integrals?.attempts === 1, 'Student A records attempt');
    assert(studentB.getState().conceptMastery.calculus_integrals === undefined, 'Student B state remains strictly isolated');

    // AI prompt multi-tenant isolation
    const personaA = buildPersona({ level: 'Basic', studentState: studentA.getState() });
    const personaB = buildPersona({ level: 'Basic', studentState: studentB.getState() });
    assert(personaA.includes('CALCULUS_INTEGRALS') || personaA.includes('REAL-TIME COGNITIVE'), 'Persona A reflects Student A mastery');
    assert(!personaB.includes('CALCULUS_INTEGRALS'), 'Persona B does not leak Student A mastery');
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log(`========================================\n`);

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});