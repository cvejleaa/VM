// ---------------------------------------------------------------------------
// functions/rules.test.js — Tests for Firestore sikkerhedsregler.
//
// KRÆVER Firebase Emulator (firestore):
//   firebase emulators:start --only firestore,auth
//
// Kør med:
//   npm run test:rules
// eller:
//   FIRESTORE_EMULATOR_HOST=localhost:8080 vitest run --config ../vitest.rules.config.js
//
// Disse tests verificerer de kritiske sikkerhedsprincipper fra architecture.md.
// ---------------------------------------------------------------------------

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { expect }                  from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
}                                  from '@firebase/rules-unit-testing';
import { readFileSync }            from 'fs';
import { fileURLToPath }           from 'url';
import { dirname, join }           from 'path';
import { setDoc, doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const rootDir    = join(__dirname, '..');

// Indlæs Firestore-reglerne
const rules = readFileSync(join(rootDir, 'firestore.rules'), 'utf8');

let testEnv;

// ---------------------------------------------------------------------------
// Setup: initialiser test-environment med emulator
// ---------------------------------------------------------------------------
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vm2026-tip-test',
    firestore: {
      rules,
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || 'localhost',
      port: parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8080'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  // Ryd alle data mellem tests
  if (testEnv) await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// Hjælpefunktioner
// ---------------------------------------------------------------------------

/** Opret en godkendt bruger med given rolle via admin-context */
async function createUser(uid, role = 'player', status = 'approved') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc(uid).set({
      displayName: `Testspiller ${uid}`,
      email:       `${uid}@test.dk`,
      role,
      status,
      totalPoints: 0,
      createdAt:   Timestamp.now(),
    });
  });
}

/** Opret en kamp via admin-context */
async function createMatch(matchId, kickoffDate) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('matches').doc(matchId).set({
      round:     'group',
      groupName: 'A',
      homeTeam:  'BRA',
      awayTeam:  'ARG',
      kickoff:   Timestamp.fromDate(kickoffDate),
      status:    'scheduled',
      result:    null,
    });
  });
}

/** Opret et bonusspørgsmål via admin-context */
async function createBonusQuestion(questionId, deadline) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('bonusQuestions').doc(questionId).set({
      type:      'groupWinner',
      label:     'Hvem vinder gruppe A?',
      groupName: 'A',
      deadline:  Timestamp.fromDate(deadline),
      facit:     null,
      options:   ['BRA', 'ARG', 'URU', 'COL'],
    });
  });
}

// ---------------------------------------------------------------------------
// TESTS: users-collection
// ---------------------------------------------------------------------------
describe('users/{uid} — sikkerhedsregler', () => {
  it('godkendt spiller KAN læse en anden spillers profil', async () => {
    await createUser('user1', 'player', 'approved');
    await createUser('user2', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'users', 'user2'))
    );
  });

  it('en spiller KAN IKKE ændre sin egen role', async () => {
    await createUser('user1', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        displayName: 'Nyt navn',
        role:        'owner', // forsøger at opgradere sig selv
      })
    );
  });

  it('en spiller KAN IKKE ændre sin egen status', async () => {
    await createUser('user1', 'player', 'pending');

    const ctx = testEnv.authenticatedContext('user1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        status: 'approved', // forsøger at godkende sig selv
      })
    );
  });

  it('en spiller KAN opdatere sit eget displayName', async () => {
    await createUser('user1', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        displayName: 'Nyt fantastisk navn',
      })
    );
  });

  it('en ikke-owner KAN IKKE godkende en anden bruger', async () => {
    await createUser('admin1', 'matchAdmin', 'approved');
    await createUser('user2', 'player',     'pending');

    const ctx = testEnv.authenticatedContext('admin1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user2'), {
        status: 'approved', // matchAdmin har ikke lov
      })
    );
  });

  it('owner KAN godkende en bruger', async () => {
    await createUser('owner1', 'owner',  'approved');
    await createUser('user2',  'player', 'pending');

    const ctx = testEnv.authenticatedContext('owner1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user2'), {
        status: 'approved',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: bets-collection
// ---------------------------------------------------------------------------
describe('bets/{betId} — sikkerhedsregler', () => {
  it('spiller KAN oprette et bet FØR kickoff', async () => {
    const uid      = 'betUser1';
    const matchId  = 'test_match_1';
    const futureKickoff = new Date(Date.now() + 60 * 60 * 1000); // 1 time frem

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    const ctx   = testEnv.authenticatedContext(uid);
    const betId = `${uid}_${matchId}`;

    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'bets', betId), {
        uid,
        matchId,
        home:      2,
        away:      1,
        advance:   null,
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE oprette et bet EFTER kickoff', async () => {
    const uid      = 'betUser2';
    const matchId  = 'test_match_2';
    const pastKickoff = new Date(Date.now() - 60 * 60 * 1000); // 1 time tilbage

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, pastKickoff);

    const ctx   = testEnv.authenticatedContext(uid);
    const betId = `${uid}_${matchId}`;

    await assertFails(
      setDoc(doc(ctx.firestore(), 'bets', betId), {
        uid,
        matchId,
        home:      1,
        away:      0,
        advance:   null,
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE skrive points-feltet', async () => {
    const uid      = 'betUser3';
    const matchId  = 'test_match_3';
    const futureKickoff = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    const ctx   = testEnv.authenticatedContext(uid);
    const betId = `${uid}_${matchId}`;

    await assertFails(
      setDoc(doc(ctx.firestore(), 'bets', betId), {
        uid,
        matchId,
        home:      2,
        away:      1,
        advance:   null,
        points:    5, // forsøger at sætte point manuelt
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE ændre points via update', async () => {
    const uid      = 'betUser4';
    const matchId  = 'test_match_4';
    const futureKickoff = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    // Opret bet via admin (uden points)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bets').doc(`${uid}_${matchId}`).set({
        uid,
        matchId,
        home:      1,
        away:      0,
        advance:   null,
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'bets', `${uid}_${matchId}`), {
        points: 5, // forsøger at manipulere point
      })
    );
  });

  it('spiller KAN IKKE læse andres bets', async () => {
    const uid1     = 'betUser5';
    const uid2     = 'betUser6';
    const matchId  = 'test_match_5';
    const futureKickoff = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid1, 'player', 'approved');
    await createUser(uid2, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    // Opret bet for uid1 via admin
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bets').doc(`${uid1}_${matchId}`).set({
        uid: uid1, matchId, home: 2, away: 1,
      });
    });

    // uid2 forsøger at læse uid1's bet
    const ctx = testEnv.authenticatedContext(uid2);
    await assertFails(
      getDoc(doc(ctx.firestore(), 'bets', `${uid1}_${matchId}`))
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: bonusBets-collection
// ---------------------------------------------------------------------------
describe('bonusBets/{betId} — sikkerhedsregler', () => {
  it('spiller KAN oprette bonusbet FØR deadline', async () => {
    const uid        = 'bonusUser1';
    const questionId = 'groupWinner_A';
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createBonusQuestion(questionId, futureDeadline);

    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'bonusBets', `${uid}_${questionId}`), {
        uid,
        questionId,
        answer:    'BRA',
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE oprette bonusbet EFTER deadline', async () => {
    const uid        = 'bonusUser2';
    const questionId = 'groupWinner_B';
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createBonusQuestion(questionId, pastDeadline);

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      setDoc(doc(ctx.firestore(), 'bonusBets', `${uid}_${questionId}`), {
        uid,
        questionId,
        answer:    'ARG',
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE skrive points til bonusbet', async () => {
    const uid        = 'bonusUser3';
    const questionId = 'groupWinner_C';
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createBonusQuestion(questionId, futureDeadline);

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      setDoc(doc(ctx.firestore(), 'bonusBets', `${uid}_${questionId}`), {
        uid,
        questionId,
        answer:    'BRA',
        points:    10, // forsøger at sætte bonus-point
        updatedAt: Timestamp.now(),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: matches-collection
// ---------------------------------------------------------------------------
describe('matches — sikkerhedsregler', () => {
  it('godkendt spiller KAN læse kampe', async () => {
    await createUser('matchReader', 'player', 'approved');
    await createMatch('readable_match', new Date(Date.now() + 3600000));

    const ctx = testEnv.authenticatedContext('matchReader');
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'matches', 'readable_match'))
    );
  });

  it('spiller KAN IKKE oprette kampe', async () => {
    await createUser('matchCreator', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('matchCreator');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'matches', 'new_match'), {
        round:   'group',
        kickoff: Timestamp.now(),
        status:  'scheduled',
      })
    );
  });

  it('matchAdmin KAN oprette kampe', async () => {
    await createUser('adminUser', 'matchAdmin', 'approved');

    const ctx = testEnv.authenticatedContext('adminUser');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'matches', 'admin_created_match'), {
        round:           'group',
        groupName:       'A',
        homeTeam:        'BRA',
        awayTeam:        'ARG',
        kickoff:         Timestamp.fromDate(new Date(Date.now() + 86400000)),
        status:          'scheduled',
        result:          null,
        homePlaceholder: null,
        awayPlaceholder: null,
      })
    );
  });
});
