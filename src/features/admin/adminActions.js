// Firestore-handlinger for admin-panelet.
// Alle skrivninger sker her — UI-komponenter kalder disse funktioner.
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { COL, ROLES } from '../../lib/constants';

// ─── Brugerstyring (kun owner) ───────────────────────────────────────────────

/**
 * Godkend eller afvis en bruger.
 * @param {string} uid
 * @param {'approved'|'rejected'} newStatus
 */
export async function setUserStatus(uid, newStatus) {
  const ref = doc(db, COL.USERS, uid);
  await updateDoc(ref, { status: newStatus });
}

/**
 * Skift en brugers rolle mellem 'player' og 'matchAdmin'.
 * Kan ikke ændre owner-rollen.
 * @param {string} uid
 * @param {string} currentRole
 */
export async function toggleMatchAdminRole(uid, currentRole) {
  if (currentRole === ROLES.OWNER) {
    throw new Error('Kan ikke ændre owner-rollen.');
  }
  const newRole =
    currentRole === ROLES.MATCH_ADMIN ? ROLES.PLAYER : ROLES.MATCH_ADMIN;
  const ref = doc(db, COL.USERS, uid);
  await updateDoc(ref, { role: newRole });
}

// ─── Kampstyring (matchAdmin + owner) ────────────────────────────────────────

/**
 * Gem resultat på en kamp og sæt status til 'finished'.
 * @param {string} matchId
 * @param {{ home: number, away: number, advance?: string }} result
 */
export async function saveMatchResult(matchId, result) {
  const ref = doc(db, COL.MATCHES, matchId);
  await updateDoc(ref, {
    result: {
      home: Number(result.home),
      away: Number(result.away),
      ...(result.advance != null ? { advance: result.advance } : {}),
    },
    status: 'finished',
    // Manuel rettelse er "klæbende": auto-synken rører ikke kampen igen.
    resultSource: 'manual',
    manualLock: true,
    needsReview: false,
  });
}

/**
 * Gendan automatikken for en kamp: fjern den manuelle lås, så auto-synken
 * igen må opdatere resultatet.
 * @param {string} matchId
 */
export async function clearManualLock(matchId) {
  const ref = doc(db, COL.MATCHES, matchId);
  await updateDoc(ref, { manualLock: false, resultSource: 'auto', needsReview: false });
}

/**
 * Opdater kamp-felter (homeTeam, awayTeam, kickoff, status osv.)
 * @param {string} matchId
 * @param {object} data
 */
export async function updateMatch(matchId, data) {
  const ref = doc(db, COL.MATCHES, matchId);
  await updateDoc(ref, data);
}

/**
 * Opret en ny kamp.
 * @param {object} matchData
 */
export async function createMatch(matchData) {
  const ref = collection(db, COL.MATCHES);
  await addDoc(ref, {
    ...matchData,
    status: matchData.status ?? 'scheduled',
    result: null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Kald Cloud Function 'buildKnockout' for at generere knockout-kampe.
 * Håndterer fejl pænt hvis funktionen ikke er deployet endnu.
 */
export async function callBuildKnockout() {
  try {
    const fn = httpsCallable(functions, 'buildKnockout');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    // Funktionen findes måske ikke endnu (under udvikling)
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "buildKnockout" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af buildKnockout.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'backfillTipParticipation' for at genopbygge tip-deltagelse
 * ud fra alle eksisterende tips.
 */
export async function callBackfillTipParticipation() {
  try {
    const fn = httpsCallable(functions, 'backfillTipParticipation');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "backfillTipParticipation" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af backfillTipParticipation.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'sendTipRemindersNow' for at sende e-mail-påmindelser
 * med det samme (til test).
 */
export async function callSendTipRemindersNow() {
  try {
    const fn = httpsCallable(functions, 'sendTipRemindersNow');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "sendTipRemindersNow" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af sendTipRemindersNow.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'sendTestReminderToMe' — sender en testmail KUN til
 * admin selv med alle kampe for de første 3 spilledage.
 */
export async function callSendTestReminderToMe() {
  try {
    const fn = httpsCallable(functions, 'sendTestReminderToMe');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "sendTestReminderToMe" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af sendTestReminderToMe.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'pruneOrphanMatches' — sletter forældede knockout-kampe
 * (gamle id'er der ikke længere bruges). Kun owner.
 */
export async function callPruneOrphanMatches() {
  try {
    const fn = httpsCallable(functions, 'pruneOrphanMatches');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "pruneOrphanMatches" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af pruneOrphanMatches.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'syncResultsNow' — hent live/afsluttede resultater fra
 * football-data.org nu. dryRun=true viser kun hvad der ville ske.
 * @param {{dryRun?: boolean}} [opts]
 */
export async function callSyncResultsNow({ dryRun = false } = {}) {
  try {
    const fn = httpsCallable(functions, 'syncResultsNow');
    const result = await fn({ dryRun });
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "syncResultsNow" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af syncResultsNow.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'syncFixtures' — map vores kampe til football-data-id'er.
 * @param {{season?: number}} [opts]
 */
export async function callSyncFixtures({ season } = {}) {
  try {
    const fn = httpsCallable(functions, 'syncFixtures');
    const result = await fn(season != null ? { season } : {});
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "syncFixtures" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af syncFixtures.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'syncGroupWinnersNow' — afgør gruppevindere ud fra
 * grupperesultaterne (sætter facit på færdigspillede grupper). dryRun=true
 * viser kun hvad der ville ske.
 * @param {{dryRun?: boolean}} [opts]
 */
export async function callSyncGroupWinners({ dryRun = false } = {}) {
  try {
    const fn = httpsCallable(functions, 'syncGroupWinnersNow');
    const result = await fn({ dryRun });
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "syncGroupWinnersNow" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af syncGroupWinnersNow.';
    return { ok: false, error: msg };
  }
}

// ─── Bonus-facit (matchAdmin + owner) ────────────────────────────────────────

/**
 * Sæt facit på et bonusspørgsmål.
 * @param {string} questionId
 * @param {string} facit
 */
export async function saveBonusFacit(questionId, facit) {
  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  await updateDoc(ref, { facit });
}

/**
 * Godkend et (fejlstavet) svar manuelt som korrekt for et bonusspørgsmål.
 * Lægges i acceptedAnswers; Cloud Function genberegner point automatisk.
 */
export async function approveBonusAnswer(questionId, answer) {
  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  await updateDoc(ref, { acceptedAnswers: arrayUnion(answer) });
}

/** Fjern et tidligere godkendt svar igen. */
export async function removeBonusAnswer(questionId, answer) {
  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  await updateDoc(ref, { acceptedAnswers: arrayRemove(answer) });
}

// ─── Hjælpefunktioner ─────────────────────────────────────────────────────────

/**
 * Formater Firestore-timestamp til dansk datostreng.
 * @param {import('firebase/firestore').Timestamp|null} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (!ts) return '–';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Konverter dansk datetime-string til Firestore Timestamp.
 * @param {string} str - ISO-format, fx "2026-06-11T18:00"
 * @returns {Timestamp}
 */
export function datetimeToTimestamp(str) {
  return Timestamp.fromDate(new Date(str));
}
