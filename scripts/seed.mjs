// ---------------------------------------------------------------------------
// scripts/seed.mjs — Seeder til VM 2026 tippekonkurrence.
//
// BRUG:
//   Mod emulator (anbefalet til test):
//     FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed.mjs
//
//   Mod produktion:
//     GOOGLE_APPLICATION_CREDENTIALS=/sti/til/serviceAccount.json node scripts/seed.mjs
//
// Krav: firebase-admin skal være installeret (npm install firebase-admin)
// Scriptet kan køres flere gange (det overskriver eksisterende data).
// ---------------------------------------------------------------------------

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

// Hent stien til projektets rod
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const rootDir    = join(__dirname, '..');

// Indlæs firebase-admin dynamisk (understøtter ESM)
const admin = (await import('firebase-admin')).default;

// ---------------------------------------------------------------------------
// Initialisér Firebase Admin
// ---------------------------------------------------------------------------
let app;

if (process.env.FIRESTORE_EMULATOR_HOST) {
  // Emulator-tilstand: brug et fake projekt-ID
  console.log(`Forbinder til Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  app = admin.initializeApp({
    projectId: 'vm2026-tip',
  });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Produktion med serviceAccount-fil
  console.log('Forbinder til produktion med GOOGLE_APPLICATION_CREDENTIALS...');
  const serviceAccount = JSON.parse(
    readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
  );
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  // Application Default Credentials (fx Cloud Shell)
  console.log('Forbinder med Application Default Credentials...');
  app = admin.initializeApp();
}

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Indlæs kampdata fra data/group-stage.json
// ---------------------------------------------------------------------------
const dataPath = join(rootDir, 'data', 'group-stage.json');
const rawData  = JSON.parse(readFileSync(dataPath, 'utf8'));
const matches  = rawData.matches.filter(m => !m._comment && !m._comment_data && !m._comment_L_note);

console.log(`\nFandt ${matches.length} kampe i group-stage.json`);

// ---------------------------------------------------------------------------
// Seed matches-collection
// ---------------------------------------------------------------------------
async function seedMatches() {
  console.log('\nSeeder matches...');
  const batch = db.batch();
  let count = 0;

  for (const match of matches) {
    const { id, ...data } = match;

    // Konverter kickoff-streng til Firestore Timestamp
    const kickoffDate = new Date(data.kickoff);
    const matchData = {
      ...data,
      kickoff:   admin.firestore.Timestamp.fromDate(kickoffDate),
      result:    data.result || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(db.collection('matches').doc(id), matchData);
    count++;

    // Firestore batch max 500 — commit og start ny batch
    if (count % 400 === 0) {
      await batch.commit();
      console.log(`  Committed ${count} kampe...`);
    }
  }

  await batch.commit();
  console.log(`  Seedet ${count} kampe OK.`);
}

// ---------------------------------------------------------------------------
// Seed config/tournament
// ---------------------------------------------------------------------------
async function seedConfig() {
  console.log('\nSeeder config/tournament...');

  await db.collection('config').doc('tournament').set({
    name:          'VM 2026 Tippekonkurrence',
    startDate:     admin.firestore.Timestamp.fromDate(new Date('2026-06-11T00:00:00Z')),
    endDate:       admin.firestore.Timestamp.fromDate(new Date('2026-08-02T23:59:59Z')),
    host:          ['USA', 'Canada', 'Mexico'],
    totalTeams:    48,
    totalGroups:   12,
    scoring: {
      exact:            5,
      goalDiff:         3,
      outcome:          2,
      wrong:            0,
      knockoutAdvance:  2,
      bonus:            10,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('  config/tournament seedet OK.');
}

// ---------------------------------------------------------------------------
// Seed bonusQuestions — topscorer + 12 gruppevindere
// ---------------------------------------------------------------------------
async function seedBonusQuestions() {
  console.log('\nSeeder bonusQuestions...');
  const batch = db.batch();

  // Topscorer-spørgsmål
  // Deadline: første kamps kickoff (11. juni 2026)
  batch.set(db.collection('bonusQuestions').doc('topScorer'), {
    type:      'topScorer',
    label:     'Hvem bliver VM 2026\'s topscorer?',
    groupName: null,
    deadline:  admin.firestore.Timestamp.fromDate(new Date('2026-06-11T23:00:00Z')),
    facit:     null,
    options:   null, // Fri tekst — ingen fast liste
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Gruppevinder-spørgsmål for alle 12 grupper
  const groups = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  // Første kamp pr. gruppe (deadline = første kamps kickoff i gruppen)
  const firstKickoffs = {
    A: '2026-06-11T23:00:00Z',
    B: '2026-06-12T20:00:00Z',
    C: '2026-06-13T02:00:00Z',
    D: '2026-06-13T20:00:00Z',
    E: '2026-06-14T23:00:00Z',
    F: '2026-06-15T20:00:00Z',
    G: '2026-06-16T23:00:00Z',
    H: '2026-06-17T20:00:00Z',
    I: '2026-06-18T20:00:00Z',
    J: '2026-06-19T20:00:00Z',
    K: '2026-06-20T23:00:00Z',
    L: '2026-06-21T23:00:00Z',
  };

  // Hold pr. gruppe til valgmuligheder
  const groupTeams = {
    A: ['MEX', 'CAN', 'USA', 'ECU'],
    B: ['ARG', 'CHI', 'PER', 'BOL'],
    C: ['BRA', 'VEN', 'COL', 'URU'],
    D: ['FRA', 'POL', 'BEL', 'ISR'],
    E: ['ESP', 'TUN', 'GER', 'DEN'],
    F: ['POR', 'CRO', 'ALG', 'MAR'],
    G: ['ENG', 'SRB', 'NED', 'SEN'],
    H: ['ITA', 'ALB', 'SUI', 'CMR'],
    I: ['KOR', 'JPN', 'AUS', 'IRN'],
    J: ['SAU', 'QAT', 'NGA', 'GHA'],
    K: ['MEX2', 'COT', 'ECU2', 'EGY'],
    L: ['SVK', 'SLO', 'ROU', 'GRE'],
  };

  for (const groupName of groups) {
    batch.set(db.collection('bonusQuestions').doc(`groupWinner_${groupName}`), {
      type:      'groupWinner',
      label:     `Hvem vinder gruppe ${groupName}?`,
      groupName,
      deadline:  admin.firestore.Timestamp.fromDate(new Date(firstKickoffs[groupName])),
      facit:     null,
      options:   groupTeams[groupName],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`  Seedet 1 topscorer + ${groups.length} gruppevinder-spørgsmål OK.`);
}

// ---------------------------------------------------------------------------
// Kør alle seed-funktioner
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== VM 2026 Seed-script ===\n');

  try {
    await seedMatches();
    await seedConfig();
    await seedBonusQuestions();

    console.log('\n=== Seed fuldført! ===');
    console.log('Tip: Åbn Firebase Emulator UI på http://localhost:4000 for at se data.');
  } catch (err) {
    console.error('\nFejl under seed:', err);
    process.exit(1);
  } finally {
    await app.delete();
    process.exit(0);
  }
}

main();
