// ---------------------------------------------------------------------------
// functions/index.js — Firebase Cloud Functions v2 til VM 2026 tippekonkurrence.
// Region: europe-west1, Node 22.
//
// Funktioner:
//   recomputeMatch    — Firestore onWrite: beregner point når kampresultat sættes
//   recomputeBonus    — Firestore onWrite: beregner point når bonus-facit sættes
//   buildKnockout     — callable: bygger knockout-bracket fra grupperesultater
//   resolveGroupWinnerOnFinish — Firestore onWrite: sætter gruppevinder-facit
//                       automatisk når en gruppes sidste kamp er færdig
//   syncGroupWinnersNow — callable (admin): afgør gruppevindere manuelt/dry-run
//
// Bemærk: bruger-oprettelse (users/{uid} med role:'player', status:'pending')
// håndteres på klienten ved registrering + Security Rules. Owner sættes manuelt
// én gang (se docs/firebase-setup.md, trin 8). Vi bruger derfor IKKE en blocking
// auth-function, som ville kræve Identity Platform (GCIP).
// ---------------------------------------------------------------------------

'use strict';

const { onCall, HttpsError }       = require('firebase-functions/v2/https');
const { onDocumentWritten }        = require('firebase-functions/v2/firestore');
const { onSchedule }               = require('firebase-functions/v2/scheduler');
const { defineSecret }             = require('firebase-functions/params');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { initializeApp }            = require('firebase-admin/app');
const nodemailer                   = require('nodemailer');

// E-mail-udsendelse via SMTP (one.com med vm@vejleaa.dk).
// Kun adgangskoden er hemmelig (Secret Manager):
//   firebase functions:secrets:set SMTP_PASSWORD
// De øvrige SMTP-indstillinger er ikke følsomme og sættes som konstanter.
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
// football-data.org API-token (auto-resultater). Sættes med:
//   firebase functions:secrets:set FOOTBALL_DATA_TOKEN
const FOOTBALL_DATA_TOKEN = defineSecret('FOOTBALL_DATA_TOKEN');
const SMTP_HOST = 'send.one.com';
const SMTP_PORT = 465; // implicit TLS
const SMTP_USER = 'vm@vejleaa.dk';
const EMAIL_FROM = 'VM 2026 Tip <vm@vejleaa.dk>';
const APP_URL = 'https://vm.vejleaa.dk';
const TZ = 'Europe/Copenhagen';

const { scoreMatch, scoreKnockout, bonusPoints } = require('./scoring');
const { buildR32FromGroupMatches } = require('./knockout');
const { computeBreakdown } = require('./breakdown');
const { createClient } = require('./footballData');
const { decideUpdate, matchFixture, patchChangesDoc } = require('./resultsSync');
const { resolveGroupWinners } = require('./bonusResolve');
const { redeemInviteCodeCore } = require('./invites');

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

    // Beregn point når kampen er afsluttet ELLER live (foreløbige point),
    // så stillingen også opdateres løbende under kampe.
    const scored = after.status === 'finished' || after.status === 'live';
    if (!scored || !after.result) return;

    const before = event.data?.before?.data();
    // Undgå genberegning hvis hverken status eller result har ændret sig
    if (
      before?.status === after.status &&
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
// backfillTipParticipation — callable (owner/matchAdmin)
// Engangs-/vedligeholdelsesfunktion: genopbygger tipParticipation ud fra ALLE
// eksisterende bets, så tip-tælleren også dækker tips afgivet før
// syncTipParticipation blev deployet.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// redeemInviteCode — callable: selvbetjent godkendelse via en ligas join-kode.
// En logget-ind (men endnu ikke godkendt) bruger indtaster en kode; matcher den
// en ADMIN-GODKENDT liga, sættes status='approved' og brugeren tilmeldes ligaen.
// Hele beslutningen sker server-side med admin-rettigheder — klienten kan aldrig
// selv sætte 'approved'. Rate-limiting beskytter mod gæt af koder.
// ---------------------------------------------------------------------------
exports.redeemInviteCode = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  }
  const db = getFirestore();
  const uid = request.auth.uid;

  const result = await redeemInviteCodeCore({
    uid,
    rawCode: request.data?.code,
    now: Date.now(),

    getAttempt: async (u) => {
      const snap = await db.collection('inviteAttempts').doc(u).get();
      return snap.exists ? snap.data() : null;
    },
    saveAttempt: (u, state) =>
      db.collection('inviteAttempts').doc(u).set(state, { merge: true }),

    findApprovedLeagueByCode: async (code) => {
      const snap = await db.collection('leagues')
        .where('joinCode', '==', code)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, name: d.data().name };
    },

    approveUserAndJoin: async ({ uid: u, leagueId }) => {
      const batch = db.batch();
      batch.set(db.collection('users').doc(u), {
        status: 'approved',
        approvedAt: FieldValue.serverTimestamp(),
        approvedViaInvite: true,
      }, { merge: true });
      batch.update(db.collection('leagues').doc(leagueId), {
        memberUids: FieldValue.arrayUnion(u),
      });
      await batch.commit();
    },
  });

  if (!result.ok) {
    throw new HttpsError(result.error, result.message);
  }
  return { leagueId: result.leagueId, leagueName: result.leagueName };
});

exports.backfillTipParticipation = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  }
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== 'owner' && role !== 'matchAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/matchAdmin kan køre backfill.');
  }

  // Saml uids pr. matchId fra alle bets
  const betsSnap = await db.collection('bets').get();
  const byMatch = new Map();
  for (const d of betsSnap.docs) {
    const { matchId, uid } = d.data();
    if (!matchId || !uid) continue;
    if (!byMatch.has(matchId)) byMatch.set(matchId, new Set());
    byMatch.get(matchId).add(uid);
  }

  // Skriv tipParticipation-dokumenter i batches
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  for (const [matchId, uidSet] of byMatch.entries()) {
    const ref = db.collection('tipParticipation').doc(matchId);
    batch.set(ref, { matchId, uids: [...uidSet] }, { merge: true });
    ops++;
    if (ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; }
  }
  for (const b of batches) await b.commit();

  return {
    success: true,
    matches: byMatch.size,
    bets: betsSnap.size,
    message: `Backfill færdig: ${byMatch.size} kampe opdateret ud fra ${betsSnap.size} tips.`,
  };
});

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

  const finishedGroupMatches = groupMatchesSnap.docs.map((d) => d.data());

  // Byg r32 ud fra grupperesultaterne (ren, testet logik i knockout.js)
  const { assignments: r32Assignments, best8ThirdsGroups, missingGroups } =
    buildR32FromGroupMatches(finishedGroupMatches);

  if (missingGroups.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Følgende grupper har ikke alle 6 finished kampe: ${missingGroups.join(', ')}`
    );
  }

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
// pruneOrphanMatches — callable (kun owner): sletter forældede knockout-kampe.
// Tidligere blev knockout seedet med id'er som 'r32_m01'; efter opdateringen
// hedder de 'ko_r32_1' osv. De gamle dokumenter blev aldrig slettet og fik
// kamp-tællere til at vise for mange kampe. Her fjernes alle knockout-kampe
// (round != 'group') hvis id IKKE starter med 'ko_'.
// ---------------------------------------------------------------------------
exports.pruneOrphanMatches = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (userDoc.data()?.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Kun ejeren kan rydde forældede kampe.');
  }

  const snap = await db.collection('matches').get();
  const orphans = snap.docs.filter((d) => {
    const m = d.data();
    return m.round && m.round !== 'group' && !d.id.startsWith('ko_');
  });

  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  for (const d of orphans) {
    batch.delete(d.ref);
    if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
  }
  for (const b of batches) await b.commit();

  return {
    success: true,
    deleted: orphans.length,
    ids: orphans.map((d) => d.id),
    remaining: snap.size - orphans.length,
  };
});

// ---------------------------------------------------------------------------
// Hjælpefunktion: genberegn totalPoints for en bruger
// Summer alle bets.points + bonusBets.points for brugeren
// ---------------------------------------------------------------------------
async function recalcUserTotal(db, uid) {
  // Hent brugerens bets/bonusBets samt alle kampe (til runde-opslag)
  const [betsSnap, bonusBetsSnap, matchesSnap] = await Promise.all([
    db.collection('bets').where('uid', '==', uid).get(),
    db.collection('bonusBets').where('uid', '==', uid).get(),
    db.collection('matches').get(),
  ]);

  const roundById = {};
  for (const m of matchesSnap.docs) roundById[m.id] = m.data().round;

  const { total, groupPoints, knockoutPoints, bonusPoints } = computeBreakdown(
    betsSnap.docs.map((d) => d.data()),
    bonusBetsSnap.docs.map((d) => d.data()),
    roundById,
  );

  await db.collection('users').doc(uid).update({
    totalPoints: total,
    groupPoints,
    knockoutPoints,
    bonusPoints,
  });
}

// ---------------------------------------------------------------------------
// snapshotRanks — scheduled: gemmer hver brugers nuværende placering som
// previousRank, så frontenden kan vise bevægelse i stillingen "siden i går".
// Kører tidligt om morgenen (CPH-tid).
// ---------------------------------------------------------------------------
exports.snapshotRanks = onSchedule(
  { schedule: '5 4 * * *', timeZone: TZ, region: REGION },
  async () => {
    const db = getFirestore();
    const snap = await db
      .collection('users')
      .where('status', '==', 'approved')
      .get();

    const users = snap.docs
      .map((d) => ({ id: d.id, total: d.data().totalPoints ?? 0 }))
      .sort((a, b) => b.total - a.total);

    let batch = db.batch();
    let ops = 0;
    const batches = [batch];
    users.forEach((u, idx) => {
      batch.update(db.collection('users').doc(u.id), { previousRank: idx + 1 });
      if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
    });
    for (const b of batches) await b.commit();
    console.log(`snapshotRanks: opdaterede ${users.length} brugere.`);
  }
);

// ---------------------------------------------------------------------------
// tipReminders — scheduled: sender e-mail til spillere der mangler at tippe
// på kampe der spilles i dag (CPH). Bruger Resend-API'et via fetch.
// Sender intet hvis RESEND_API_KEY ikke er sat (graceful no-op).
// ---------------------------------------------------------------------------
function cphDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Byg en SMTP-transporter ud fra parametre/secret. Returnerer null hvis der
// ikke er sat en adgangskode (så mail-udsendelse blot springes over).
function buildTransport(password) {
  if (!password) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: SMTP_USER, pass: password },
  });
}

async function sendEmail(transporter, { to, subject, html }) {
  await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
}

// Kerne-logik: send påmindelser om dagens utippede kampe. Returnerer antal sendte.
async function runTipReminders(db, transporter) {
  if (!transporter) { console.log('tipReminders: ingen SMTP_PASSWORD — springer over.'); return { sent: 0, reason: 'no-smtp-password' }; }

  const now = new Date();
  const todayStr = cphDateStr(now);

  // Dagens kampe der stadig kan tippes (kendte hold, ikke kickoff endnu)
  const matchesSnap = await db
    .collection('matches')
    .where('status', '==', 'scheduled')
    .get();

  const todayMatches = matchesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.homeTeam && m.awayTeam && m.kickoff?.toDate
      && cphDateStr(m.kickoff.toDate()) === todayStr
      && m.kickoff.toDate() > now);

  if (todayMatches.length === 0) { console.log('tipReminders: ingen kampe i dag.'); return { sent: 0, reason: 'no-matches' }; }

  // Hvem har tippet hver kamp (fra tipParticipation)
  const tippedByMatch = {};
  await Promise.all(todayMatches.map(async (m) => {
    const p = await db.collection('tipParticipation').doc(m.id).get();
    tippedByMatch[m.id] = new Set(p.exists ? (p.data().uids ?? []) : []);
  }));

  const usersSnap = await db
    .collection('users')
    .where('status', '==', 'approved')
    .get();

  let sent = 0;
  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    if (u.emailOptOut || !u.email) continue;

    const missing = todayMatches.filter((m) => !tippedByMatch[m.id].has(userDoc.id));
    if (missing.length === 0) continue;

    const list = missing
      .map((m) => `<li>${m.homeTeam} – ${m.awayTeam}</li>`)
      .join('');
    const html = `
      <p>Hej ${u.displayName || 'spiller'} 👋</p>
      <p>Du mangler at tippe på <strong>${missing.length}</strong> af dagens kampe:</p>
      <ul>${list}</ul>
      <p><a href="${APP_URL}">Afgiv dine tips på vm.vejleaa.dk</a> inden kampstart.</p>
      <p style="color:#888;font-size:12px">Du kan slå disse påmindelser fra på din profilside.</p>`;

    try {
      await sendEmail(transporter, {
        to: u.email,
        subject: `⚽ Du mangler at tippe på ${missing.length} kamp${missing.length === 1 ? '' : 'e'} i dag`,
        html,
      });
      sent++;
    } catch (e) {
      console.error(`tipReminders: kunne ikke sende til ${u.email}:`, e.message);
    }
  }
  console.log(`tipReminders: sendte ${sent} påmindelser.`);
  return { sent, candidates: todayMatches.length };
}

exports.tipReminders = onSchedule(
  { schedule: '0 9 * * *', timeZone: TZ, region: REGION, secrets: [SMTP_PASSWORD] },
  async () => { await runTipReminders(getFirestore(), buildTransport(SMTP_PASSWORD.value())); }
);

// Callable: admin kan udløse påmindelserne manuelt (til test).
exports.sendTipRemindersNow = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'owner' && role !== 'matchAdmin') {
      throw new HttpsError('permission-denied', 'Kun owner/matchAdmin kan sende påmindelser.');
    }
    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');
    const result = await runTipReminders(db, transporter);
    return { success: true, ...result };
  }
);

// Callable: send en testmail KUN til admin selv, med alle kampe for de
// første 3 spilledage (uanset om de er tippet).
exports.sendTestReminderToMe = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const u = userDoc.data();
    if (!u || (u.role !== 'owner' && u.role !== 'matchAdmin')) {
      throw new HttpsError('permission-denied', 'Kun owner/matchAdmin kan sende testmail.');
    }
    if (!u.email) throw new HttpsError('failed-precondition', 'Din profil har ingen e-mailadresse.');

    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');

    // Alle kampe med kendte hold, sorteret efter kickoff
    const snap = await db.collection('matches').get();
    const playable = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.homeTeam && m.awayTeam && m.kickoff?.toDate)
      .sort((a, b) => a.kickoff.toDate() - b.kickoff.toDate());

    // Saml de første 3 spilledage (distinkte CPH-datoer)
    const days = [];
    const byDay = new Map();
    for (const m of playable) {
      const day = cphDateStr(m.kickoff.toDate());
      if (!byDay.has(day)) {
        if (days.length >= 3) break; // sorteret → alle tidligere dage er med
        days.push(day);
        byDay.set(day, []);
      }
      byDay.get(day).push(m);
    }

    if (days.length === 0) throw new HttpsError('failed-precondition', 'Ingen kampe med kendte hold fundet.');

    const dayLabel = (d) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    const timeLabel = (d) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

    let total = 0;
    let html = `<p>Hej ${u.displayName || 'spiller'} 👋</p><p>Testmail — kampene for de første 3 spilledage:</p>`;
    for (const day of days) {
      const ms = byDay.get(day);
      total += ms.length;
      html += `<h3 style="margin:14px 0 4px">${dayLabel(ms[0].kickoff.toDate())}</h3><ul style="margin:0">`;
      for (const m of ms) {
        html += `<li>${timeLabel(m.kickoff.toDate())} — ${m.homeTeam} – ${m.awayTeam}</li>`;
      }
      html += '</ul>';
    }
    html += `<p style="margin-top:14px"><a href="${APP_URL}">Gå til vm.vejleaa.dk</a></p>
      <p style="color:#888;font-size:12px">Dette er en testmail sendt kun til dig.</p>`;

    await sendEmail(transporter, {
      to: u.email,
      subject: '🧪 Testmail: kampe for de første 3 spilledage',
      html,
    });

    return { success: true, sentTo: u.email, days: days.length, matches: total };
  }
);

// ---------------------------------------------------------------------------
// Auto-resultater fra football-data.org
//   syncResults    — onSchedule (hvert minut): henter live/afsluttede resultater
//   syncResultsNow — callable (admin): kør synk manuelt (evt. dry-run)
//   syncFixtures   — callable (admin): map vores kampe → football-data-id'er
//
// Klæbende manuel override: når admin retter et resultat sættes manualLock=true,
// og synken rører aldrig den kamp igen (før admin gendanner automatikken).
// ---------------------------------------------------------------------------
const utcDateStr = (ms) => new Date(ms).toISOString().slice(0, 10);

async function requireAdmin(db, request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const role = snap.data()?.role;
  if (role !== 'owner' && role !== 'matchAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/matchAdmin har adgang.');
  }
}

// Kerne: synk resultater for kampe i "vinduet" (lige startet / i gang).
// Returnerer en oversigt. Laver kun ét football-data-kald, når der er kampe.
async function runSyncResults(db, token, { now = new Date(), dryRun = false } = {}) {
  const fromTs = Timestamp.fromMillis(now.getTime() - 3.5 * 3600 * 1000);
  const toTs = Timestamp.fromMillis(now.getTime() + 15 * 60 * 1000);

  const snap = await db.collection('matches')
    .where('kickoff', '>=', fromTs)
    .where('kickoff', '<=', toTs)
    .get();

  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.externalId && !m.manualLock && m.status !== 'finished');

  if (candidates.length === 0) return { checked: 0, updated: 0, reason: 'no-window-matches' };

  // Datospan (UTC) der dækker kandidaterne — typisk samme dag.
  const times = candidates.map((m) => m.kickoff.toMillis());
  const dateFrom = utcDateStr(Math.min(...times));
  const dateTo = utcDateStr(Math.max(...times) + 6 * 3600 * 1000); // dæk kampe der trækker ud

  const client = createClient({ token });
  const data = await client.getMatchesInRange(dateFrom, dateTo);
  const fdById = new Map((data.matches || []).map((m) => [String(m.id), m]));

  let updated = 0; const changes = []; let review = 0;
  for (const m of candidates) {
    const fd = fdById.get(String(m.externalId));
    if (!fd) continue;
    const { action, patch } = decideUpdate(m, fd, now);
    if (action === 'skip' || !patch) continue;
    if (action === 'review') review++;
    if (!patchChangesDoc(m, patch)) continue;
    changes.push({ id: m.id, action, result: patch.result, status: patch.status, needsReview: !!patch.needsReview });
    if (!dryRun) {
      // Spred patch og erstat klientens Date med servertid.
      await db.collection('matches').doc(m.id).update({ ...patch, autoUpdatedAt: FieldValue.serverTimestamp() });
    }
    updated++;
  }
  return { checked: candidates.length, updated, review, dryRun, changes };
}

exports.syncResults = onSchedule(
  { schedule: 'every 1 minutes', timeZone: TZ, region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async () => {
    const db = getFirestore();
    const statusRef = db.collection('config').doc('syncStatus');
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) {
      console.log('syncResults: FOOTBALL_DATA_TOKEN ikke sat — springer over.');
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastError: 'FOOTBALL_DATA_TOKEN ikke sat',
        lastErrorAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }
    try {
      const res = await runSyncResults(db, token);
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastSuccessAt: FieldValue.serverTimestamp(),
        checked: res.checked ?? 0,
        updated: res.updated ?? 0,
        reason: res.reason ?? null,
        lastError: null,
      }, { merge: true });
      if (res.updated) console.log(`syncResults: opdaterede ${res.updated} kamp(e).`, res.changes);
    } catch (err) {
      console.error('syncResults: fejl', err);
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastError: String(err?.message || err),
        lastErrorAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw err; // lad Cloud Function-kørslen markeres som fejlet (synlig i logs)
    }
  }
);

exports.syncResultsNow = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    return runSyncResults(db, token, { dryRun: request.data?.dryRun === true });
  }
);

// Map vores kampe til football-data-id'er (gemmes som externalId på kampen).
exports.syncFixtures = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');

    const season = Number(request.data?.season) || new Date().getUTCFullYear();
    const client = createClient({ token });
    const data = await client.getSeasonMatches(season);
    const fdMatches = data.matches || [];

    const snap = await db.collection('matches').get();
    const ours = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    let mapped = 0; let already = 0; const unmatched = []; const unmatchedDetail = [];
    const batch = db.batch();
    for (const m of ours) {
      if (!m.homeTeam || !m.awayTeam) continue; // ukendte hold (knockout-pladsholdere)
      const fd = matchFixture(m, fdMatches);
      if (!fd) {
        unmatched.push(m.id);
        unmatchedDetail.push({ id: m.id, home: m.homeTeam, away: m.awayTeam });
        continue;
      }
      if (String(m.externalId) === String(fd.id)) { already++; continue; }
      batch.update(db.collection('matches').doc(m.id), { externalId: String(fd.id) });
      mapped++;
    }
    if (mapped > 0) await batch.commit();
    return { season, totalFixtures: fdMatches.length, mapped, already, unmatched, unmatchedDetail };
  }
);

// ---------------------------------------------------------------------------
// Gruppevindere — afgøres automatisk ud fra grupperesultaterne, på samme måde
// som auto-resultater. Når en gruppe er færdigspillet (6 finished kampe),
// sættes facit på det tilsvarende groupWinner-bonusspørgsmål; recomputeBonus
// giver så automatisk point. Allerede satte facit (fx manuelt) røres aldrig.
// ---------------------------------------------------------------------------
async function runResolveGroupWinners(db, { dryRun = false } = {}) {
  const qSnap = await db.collection('bonusQuestions').where('type', '==', 'groupWinner').get();
  const questions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const open = questions.filter((q) => q.facit == null || String(q.facit).trim() === '');
  if (open.length === 0) return { resolved: 0, pending: 0, changes: [] };

  const mSnap = await db.collection('matches')
    .where('round', '==', 'group')
    .where('status', '==', 'finished')
    .get();
  const finishedGroupMatches = mSnap.docs.map((d) => d.data());

  const resolutions = resolveGroupWinners(open, finishedGroupMatches);
  if (!dryRun && resolutions.length > 0) {
    const batch = db.batch();
    for (const r of resolutions) {
      batch.update(db.collection('bonusQuestions').doc(r.questionId), {
        facit: r.facit,
        facitSource: 'auto',
        autoResolvedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return { resolved: resolutions.length, pending: open.length - resolutions.length, dryRun, changes: resolutions };
}

// Trigger: når en gruppekamp netop er blevet finished, så prøv at afgøre
// gruppevindere (gør kun noget, når en gruppe dermed er fuldt færdigspillet).
exports.resolveGroupWinnerOnFinish = onDocumentWritten(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after || after.round !== 'group' || after.status !== 'finished') return;
    const before = event.data?.before?.data();
    if (before?.status === 'finished') return; // var allerede færdig — undgå gentagne kørsler

    const res = await runResolveGroupWinners(getFirestore());
    if (res.resolved) console.log(`resolveGroupWinnerOnFinish: afgjorde ${res.resolved} gruppevinder(e).`, res.changes);
  }
);

// Callable (admin): afgør gruppevindere nu. dryRun=true viser kun hvad der ville ske.
exports.syncGroupWinnersNow = onCall(
  { region: REGION },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    return runResolveGroupWinners(db, { dryRun: request.data?.dryRun === true });
  }
);
