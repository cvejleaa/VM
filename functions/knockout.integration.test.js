// ---------------------------------------------------------------------------
// functions/knockout.integration.test.js
// Ende-til-ende test mod Firestore-emulatoren: seeder den RIGTIGE kampdata,
// markerer gruppekampene som spillet, bygger r32 med den rigtige logik og
// verificerer at de genererede kamp-id'er rent faktisk findes i databasen.
//
// Dette fanger fejlklassen "buildKnockout peger på id'er der ikke findes"
// (som tidligere efterlod forældede dokumenter og forkerte tællere).
//
// KRÆVER emulator — kører i samme CI-job som rules-testene.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Timestamp } from 'firebase/firestore';
import knockout from './knockout.js';

const { buildR32FromGroupMatches } = knockout;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const rules = readFileSync(join(rootDir, 'firestore.rules'), 'utf8');
const matchData = JSON.parse(
  readFileSync(join(rootDir, 'data', 'group-stage.json'), 'utf8'),
).matches.filter((m) => m.id);

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vm2026-tip-knockout',
    firestore: {
      rules,
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || 'localhost',
      port: parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8080'),
    },
  });

  // Seed alle kampe (med admin-rettigheder)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const m of matchData) {
      const { id, ...rest } = m;
      const isGroup = rest.round === 'group';
      await db.collection('matches').doc(id).set({
        ...rest,
        kickoff: Timestamp.fromDate(new Date(rest.kickoff)),
        // Markér gruppekampe som spillet med et resultat
        status: isGroup ? 'finished' : (rest.status || 'pendingTeams'),
        result: isGroup ? { home: 2, away: 1 } : null,
      });
    }
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('buildKnockout — ende-til-ende mod emulator', () => {
  it('bygger 16 r32-kampe uden manglende grupper ud fra seedet data', async () => {
    let finishedGroup;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('matches')
        .where('round', '==', 'group').where('status', '==', 'finished').get();
      finishedGroup = snap.docs.map((d) => d.data());
    });

    const { assignments, missingGroups } = buildR32FromGroupMatches(finishedGroup);
    expect(missingGroups).toHaveLength(0);
    expect(assignments).toHaveLength(16);
  });

  it('alle genererede r32-id\'er findes som kamp-dokumenter i databasen', async () => {
    let finishedGroup, existingIds;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const groupSnap = await db.collection('matches')
        .where('round', '==', 'group').where('status', '==', 'finished').get();
      finishedGroup = groupSnap.docs.map((d) => d.data());
      const allSnap = await db.collection('matches').get();
      existingIds = new Set(allSnap.docs.map((d) => d.id));
    });

    const { assignments } = buildR32FromGroupMatches(finishedGroup);
    for (const a of assignments) {
      expect(existingIds.has(a.id)).toBe(true); // ingen kamp peger på et ukendt id
    }
  });

  it('skriver hold til de rigtige ko_r32-dokumenter', async () => {
    let finishedGroup;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('matches')
        .where('round', '==', 'group').where('status', '==', 'finished').get();
      finishedGroup = snap.docs.map((d) => d.data());
    });
    const { assignments } = buildR32FromGroupMatches(finishedGroup);

    // Skriv rank-baserede kampe (altid udfyldt) og læs tilbage
    const m1 = assignments.find((a) => a.id === 'ko_r32_1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('matches').doc('ko_r32_1').update({
        homeTeam: m1.home, awayTeam: m1.away, status: 'scheduled',
      });
      const doc = await ctx.firestore().collection('matches').doc('ko_r32_1').get();
      expect(doc.data().homeTeam).toBe(m1.home);
      expect(doc.data().awayTeam).toBe(m1.away);
    });
  });
});
