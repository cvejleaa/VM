// ---------------------------------------------------------------------------
// functions/index.js — Firebase Cloud Functions v2 til VM 2026 tippekonkurrence.
// Region: europe-west1, Node 22.
//
// Funktioner:
//   recomputeMatch    — Firestore onWrite: beregner point når kampresultat sættes
//   recomputeBonus    — Firestore onWrite: beregner point når bonus-facit sættes
//   buildKnockout     — callable: bygger knockout-bracket fra grupperesultater
//
// Bemærk: bruger-oprettelse (users/{uid} med role:'player', status:'pending')
// håndteres på klienten ved registrering + Security Rules. Owner sættes manuelt
// én gang (se docs/firebase-setup.md, trin 8). Vi bruger derfor IKKE en blocking
// auth-function, som ville kræve Identity Platform (GCIP).
// ---------------------------------------------------------------------------

'use strict';

const { onCall, HttpsError }       = require('firebase-functions/v2/https');
const { onDocumentWritten }        = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { initializeApp }            = require('firebase-admin/app');

const { scoreMatch, scoreKnockout, bonusPoints } = require('./scoring');
const { computeGroupStandings, pickBestThirds } = require('./standings');

// Initialiser Firebase Admin (singleton)
initializeApp();

// Region for alle funktioner
const REGION = 'europe-west1';

// ---------------------------------------------------------------------------
// recomputeMatch — beregner point for alle bets når et kampresultat ændres
// ---------------------------------------------------------------------------
exports.recomputeMatch = onDocumentWritten(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { matchId } = event.params;

    const after = event.data?.after?.data();
    if (!after) return; // slettet kamp — intet at gøre

    // Kun beregn point når status er 'finished' og result er sat
    if (after.status !== 'finished' || !after.result) return;

    const before = event.data?.before?.data();
    // Undgå genberegning hvis result ikke har ændret sig
    if (
      before?.status === 'finished' &&
      JSON.stringify(before?.result) === JSON.stringify(after.result)
    ) return;

    const result = after.result;
    // Afgør om det er en knockout-runde
    const isKnockout = after.round && after.round !== 'group';

    // Hent alle bets for denne kamp
    const betsSnap = await db
      .collection('bets')
      .where('matchId', '==', matchId)
      .get();

    if (betsSnap.empty) return;

    // Beregn point i batches (Firestore max 500 pr. batch)
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let opsInBatch = 0;
    const batches = [batch];

    for (const betDoc of betsSnap.docs) {
      const bet = betDoc.data();
      const pts = isKnockout
        ? scoreKnockout(bet, result)
        : scoreMatch(bet, result);

      batch.update(betDoc.ref, { points: pts });
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        batch = db.batch();
        batches.push(batch);
        opsInBatch = 0;
      }
    }

    // Commit alle batches
    for (const b of batches) {
      await b.commit();
    }

    // Opdater totalPoints for hver berørt bruger
    const affectedUids = [...new Set(betsSnap.docs.map(d => d.data().uid))];

    for (const uid of affectedUids) {
      await recalcUserTotal(db, uid);
    }
  }
);

// ---------------------------------------------------------------------------
// recomputeBonus — beregner point for alle bonusBets når facit sættes
// ---------------------------------------------------------------------------
exports.recomputeBonus = onDocumentWritten(
  { document: 'bonusQuestions/{questionId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { questionId } = event.params;

    const after = event.data?.after?.data();
    if (!after?.facit) return; // Facit ikke sat endnu

    const before = event.data?.before?.data();
    // Genberegn hvis facit ELLER de admin-godkendte svar er ændret
    const acceptedJSON = JSON.stringify(after.acceptedAnswers ?? []);
    const beforeAcceptedJSON = JSON.stringify(before?.acceptedAnswers ?? []);
    if (before?.facit === after.facit && beforeAcceptedJSON === acceptedJSON) return;

    const facit = after.facit;
    const acceptedAnswers = after.acceptedAnswers ?? [];
    const type = after.type;

    // Hent alle bonusBets for dette spørgsmål
    const betsSnap = await db
      .collection('bonusBets')
      .where('questionId', '==', questionId)
      .get();

    if (betsSnap.empty) return;

    // Opdater points i batches
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let opsInBatch = 0;
    const batches = [batch];

    for (const betDoc of betsSnap.docs) {
      const bet = betDoc.data();
      const pts = bonusPoints({ answer: bet.answer, facit, type, acceptedAnswers });

      batch.update(betDoc.ref, { points: pts });
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        batch = db.batch();
        batches.push(batch);
        opsInBatch = 0;
      }
    }

    for (const b of batches) {
      await b.commit();
    }

    // Opdater totalPoints for berørte brugere
    const affectedUids = [...new Set(betsSnap.docs.map(d => d.data().uid))];
    for (const uid of affectedUids) {
      await recalcUserTotal(db, uid);
    }
  }
);

// ---------------------------------------------------------------------------
// syncTipParticipation — vedligeholder tipParticipation/{matchId} = { uids: [...] }
// Holder styr på HVEM der har tippet på en kamp (men ikke hvad de tippede),
// så ligaer kan vise "X af N har tippet" og hvem der mangler — uden at afsløre
// nogen forudsigelser før kickoff.
// ---------------------------------------------------------------------------
exports.syncTipParticipation = onDocumentWritten(
  { document: 'bets/{betId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const matchId = after?.matchId ?? before?.matchId;
    const uid = after?.uid ?? before?.uid;
    if (!matchId || !uid) return;

    const ref = db.collection('tipParticipation').doc(matchId);

    if (after) {
      // Bet oprettet eller opdateret → uid har tippet på kampen
      await ref.set(
        { matchId, uids: FieldValue.arrayUnion(uid) },
        { merge: true },
      );
    } else {
      // Bet slettet → fjern uid (sker normalt ikke fra klienten)
      await ref.set(
        { matchId, uids: FieldValue.arrayRemove(uid) },
        { merge: true },
      );
    }
  }
);

// ---------------------------------------------------------------------------
// buildKnockout — callable funktion (kun owner/matchAdmin)
// Beregner grupperangering og udfylder holdnavne på knockout-kampe
// ---------------------------------------------------------------------------
exports.buildKnockout = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();

  // Tjek autentificering
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  }

  // Hent brugerens rolle
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('permission-denied', 'Brugerprofil ikke fundet.');
  }

  const userRole = userDoc.data()?.role;
  if (userRole !== 'owner' && userRole !== 'matchAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/matchAdmin kan bygge knockout-bracket.');
  }

  // Hent alle gruppekampe der er finished
  const groupMatchesSnap = await db
    .collection('matches')
    .where('round', '==', 'group')
    .where('status', '==', 'finished')
    .get();

  // Grupper kampe pr. gruppe
  const matchesByGroup = {};
  for (const doc of groupMatchesSnap.docs) {
    const m = doc.data();
    const g = m.groupName;
    if (!matchesByGroup[g]) matchesByGroup[g] = [];
    matchesByGroup[g].push(m);
  }

  // Tjek at alle 12 grupper har alle 6 kampe
  const EXPECTED_GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  const missingGroups = EXPECTED_GROUPS.filter(
    g => !matchesByGroup[g] || matchesByGroup[g].length < 6
  );
  if (missingGroups.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Følgende grupper har ikke alle 6 finished kampe: ${missingGroups.join(', ')}`
    );
  }

  // Beregn grupperangering for alle grupper
  const groupStandings = {};
  const allThirds = [];

  for (const groupName of EXPECTED_GROUPS) {
    const groupMatches = matchesByGroup[groupName];
    // Udled hold fra kampene
    const teamSet = new Set();
    for (const m of groupMatches) {
      teamSet.add(m.homeTeam);
      teamSet.add(m.awayTeam);
    }
    const teams = [...teamSet];
    const standings = computeGroupStandings(teams, groupMatches);
    groupStandings[groupName] = standings;

    // Gem 3'eren til best-thirds-udvælgelse
    const third = standings[2];
    if (third) {
      allThirds.push({ ...third, groupName });
    }
  }

  // Udvælg de 8 bedste 3'ere
  const best8Thirds = pickBestThirds(allThirds);
  const best8ThirdsGroups = best8Thirds.map(t => t.groupName);

  // ---------------------------------------------------------------------------
  // VM 2026 Bracket-mapping (r32 / 1/16-finale):
  // 48 hold: 12 gruppevindesre (1'ere), 12 toere + 8 bedste 3'ere = 32 hold
  //
  // FIFA VM 2026 placering i r32 (officielt bracket):
  // Kamp 1:  1A vs 2B
  // Kamp 2:  1C vs 3D/E/F (bedste 3'er fra gruppe D, E, eller F)
  // Kamp 3:  1B vs 3A/D/E/F
  // Kamp 4:  1D vs 2C
  // Kamp 5:  1E vs 3A/B/C/D
  // Kamp 6:  1G vs 2H
  // Kamp 7:  1F vs 3A/B/C
  // Kamp 8:  1H vs 2G
  // Kamp 9:  1I vs 2J
  // Kamp 10: 1K vs 3L/I/J (bedste 3'er fra L, I, J)
  // Kamp 11: 1J vs 3H/I/K
  // Kamp 12: 1L vs 2K
  // Kamp 13: 1M (ubrugt — VM 2026 har kun 12 grupper)
  //
  // Simplificeret mapping (FIFA bruger lodtrækning for 3'ernes placering
  // baseret på hvilke grupper der kvalificerer 3'ere):
  // Vi bruger en fast bracket baseret på gruppenavne A-L.
  //
  // R32 kampe (32 hold → 16 hold):
  //  M1:  1A vs 2B    M2:  1C vs 3DEF
  //  M3:  1B vs 3ADE  M4:  1D vs 2C
  //  M5:  1E vs 3ABC  M6:  1G vs 2H
  //  M7:  1F vs 3ABD  M8:  1H vs 2G
  //  M9:  1I vs 2J    M10: 1K vs 3IJL
  //  M11: 1J vs 3HIK  M12: 1L vs 2K
  //  M13: 2E vs 3FGH  M14: 2I vs 3GHL
  //  M15: 2F vs 2L    M16: 2D vs 3CEF
  // ---------------------------------------------------------------------------

  // Hjælpefunktion: find team for en given gruppe + placering
  const getTeam = (groupName, rank) => {
    const s = groupStandings[groupName];
    return s ? (s[rank - 1]?.team || null) : null;
  };

  // Hjælpefunktion: vælg bedste 3'er fra en liste af gruppenavne
  const getBestThirdFrom = (groupNames) => {
    const candidates = best8Thirds.filter(t => groupNames.includes(t.groupName));
    return candidates.length > 0 ? candidates[0].team : null;
  };

  // Definer r32-kampe (matchId fra data/group-stage.json er r32_m01 osv.)
  const r32Assignments = [
    { id: 'r32_m01', home: getTeam('A', 1), away: getTeam('B', 2) },
    { id: 'r32_m02', home: getTeam('C', 1), away: getBestThirdFrom(['D','E','F']) },
    { id: 'r32_m03', home: getTeam('B', 1), away: getBestThirdFrom(['A','D','E']) },
    { id: 'r32_m04', home: getTeam('D', 1), away: getTeam('C', 2) },
    { id: 'r32_m05', home: getTeam('E', 1), away: getBestThirdFrom(['A','B','C']) },
    { id: 'r32_m06', home: getTeam('G', 1), away: getTeam('H', 2) },
    { id: 'r32_m07', home: getTeam('F', 1), away: getBestThirdFrom(['A','B','D']) },
    { id: 'r32_m08', home: getTeam('H', 1), away: getTeam('G', 2) },
    { id: 'r32_m09', home: getTeam('I', 1), away: getTeam('J', 2) },
    { id: 'r32_m10', home: getTeam('K', 1), away: getBestThirdFrom(['I','J','L']) },
    { id: 'r32_m11', home: getTeam('J', 1), away: getBestThirdFrom(['H','I','K']) },
    { id: 'r32_m12', home: getTeam('L', 1), away: getTeam('K', 2) },
    { id: 'r32_m13', home: getTeam('E', 2), away: getBestThirdFrom(['F','G','H']) },
    { id: 'r32_m14', home: getTeam('I', 2), away: getBestThirdFrom(['G','H','L']) },
    { id: 'r32_m15', home: getTeam('F', 2), away: getTeam('L', 2) },
    { id: 'r32_m16', home: getTeam('D', 2), away: getBestThirdFrom(['C','E','F']) },
  ];

  // Opdater knockout-kampe med hold og sæt status til 'scheduled'
  const writeBatch = db.batch();
  let updatedCount = 0;

  for (const assignment of r32Assignments) {
    if (!assignment.home || !assignment.away) continue;

    const matchRef = db.collection('matches').doc(assignment.id);
    writeBatch.update(matchRef, {
      homeTeam:          assignment.home,
      awayTeam:          assignment.away,
      homePlaceholder:   null,
      awayPlaceholder:   null,
      status:            'scheduled',
    });
    updatedCount++;
  }

  await writeBatch.commit();

  return {
    success: true,
    message: `Knockout-bracket bygget. ${updatedCount} r32-kampe opdateret.`,
    best8ThirdsGroups,
  };
});

// ---------------------------------------------------------------------------
// Hjælpefunktion: genberegn totalPoints for en bruger
// Summer alle bets.points + bonusBets.points for brugeren
// ---------------------------------------------------------------------------
async function recalcUserTotal(db, uid) {
  // Hent alle bets for brugeren
  const [betsSnap, bonusBetsSnap] = await Promise.all([
    db.collection('bets').where('uid', '==', uid).get(),
    db.collection('bonusBets').where('uid', '==', uid).get(),
  ]);

  let total = 0;
  for (const doc of betsSnap.docs) {
    const pts = doc.data().points;
    if (typeof pts === 'number') total += pts;
  }
  for (const doc of bonusBetsSnap.docs) {
    const pts = doc.data().points;
    if (typeof pts === 'number') total += pts;
  }

  await db.collection('users').doc(uid).update({ totalPoints: total });
}
