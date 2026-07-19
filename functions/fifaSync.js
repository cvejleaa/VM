// ---------------------------------------------------------------------------
// fifaSync.js — orkestrering af FIFA-baseret synk (resultater, kampdetaljer,
// knockout-hold, stadion). Parallel til football-data-synken i index.js, men
// bygger på FIFA's gratis API via fifaData/fifaMap. Ren beslutningslogik ligger
// i fifaResultsSync.js/fifaMap.js — dette lag rører Firestore.
//
// Kilde-flag: config/settings.dataSource ('fifa' | 'footballdata', default sidste).
// De skemalagte synk-funktioner router hertil når flaget er 'fifa'.
// ---------------------------------------------------------------------------
'use strict';

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { createFifaClient } = require('./fifaData');
const fifaMap = require('./fifaMap');
const { decideFifaUpdate } = require('./fifaResultsSync');
const { patchChangesDoc, kickoffMs } = require('./resultsSync');

const SLOT_WINDOW_MS = 6 * 3600 * 1000; // knockout-slot: samme runde + kickoff inden for 6t

const pairKey = (a, b) => [a, b].filter(Boolean).sort().join('_');

// Bracket-bucket til knockout-matchning. FIFA lumper 3.-pladskampen (bronze)
// sammen med finalen under samme stadie (begge mappes til 'final' hos os), så de
// deler bucket. De skelnes stadig på kickoff — hver slot har sit eget tidspunkt.
const bracketBucket = (round) => (round === 'bronze' ? 'final' : round);

/**
 * Vælg den FIFA-knockoutkamp der udfylder én af vores TBD-slots. Match på
 * bracket-bucket (så bronze også kan ramme FIFA's 'final'-bucket) + nærmeste
 * kickoff inden for vinduet. Ren funktion — ingen Firestore/netværk.
 * @param {{round:string, kickoffMs:number}} slot   vores slot (kickoff i ms)
 * @param {Array<{round:string, kickoffISO:string, homeTeam:string, awayTeam:string}>} fifaKO
 * @param {number} windowMs
 * @returns {object|null} bedste FIFA-kamp eller null
 */
function selectKnockoutFill(slot, fifaKO, windowMs = SLOT_WINDOW_MS) {
  if (!slot || Number.isNaN(slot.kickoffMs)) return null;
  let best = null; let bestDelta = Infinity;
  for (const fm of fifaKO) {
    if (bracketBucket(fm.round) !== bracketBucket(slot.round)) continue;
    if (!fm.kickoffISO) continue;
    const delta = Math.abs(new Date(fm.kickoffISO).getTime() - slot.kickoffMs);
    if (delta < bestDelta && delta <= windowMs) { best = fm; bestDelta = delta; }
  }
  return best;
}

/** Læs kilde-flaget. Default 'footballdata' (sikker fallback). */
async function getDataSource(db) {
  try {
    const snap = await db.collection('config').doc('settings').get();
    return snap.data()?.dataSource === 'fifa' ? 'fifa' : 'footballdata';
  } catch {
    return 'footballdata';
  }
}

/** Hent FIFA-kampprogrammet og indeksér efter uordnet holdpar. */
async function fetchFifaByPair(client) {
  const cal = await client.getSeasonMatches({ count: 500 });
  const byPair = new Map();
  const byExternal = new Map();
  for (const raw of (Array.isArray(cal?.Results) ? cal.Results : [])) {
    const fm = fifaMap.mapCalendarMatch(raw);
    if (!fm) continue;
    byExternal.set(fm.externalId, fm);
    if (fm.homeTeam && fm.awayTeam) byPair.set(pairKey(fm.homeTeam, fm.awayTeam), fm);
  }
  return { byPair, byExternal };
}

/**
 * FIFA-resultatsynk — parallel til runSyncResults. Idempotent: skriver kun ved
 * reel ændring (resultat/status ELLER manglende stadion). Knockout scores på
 * eksakt 90-min (via tidslinjen) og markeres bekræftet (koSyncVersion) med det
 * samme.
 *
 * Læser som standard KUN kampe i tidsvinduet (kickoff ~-3,5t..+15min) — så den
 * skemalagte kørsel hvert minut ikke scanner hele samlingen (sparer Firestore-
 * læsninger). `full`/`venueOnly` scanner alle kampe (til engangs-backfill).
 */
async function runFifaResultsSync(db, { now = new Date(), dryRun = false, koSyncVersion = null, venueOnly = false, full = false } = {}) {
  const client = createFifaClient();
  const { byPair } = await fetchFifaByPair(client);

  const scanAll = full || venueOnly;
  let snap;
  if (scanAll) {
    snap = await db.collection('matches').get();
  } else {
    const fromTs = Timestamp.fromMillis(now.getTime() - 3.5 * 3600 * 1000);
    const toTs = Timestamp.fromMillis(now.getTime() + 15 * 60 * 1000);
    snap = await db.collection('matches').where('kickoff', '>=', fromTs).where('kickoff', '<=', toTs).get();
  }
  const ours = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let updated = 0; let review = 0; const changes = [];
  for (const m of ours) {
    if (!m.homeTeam || !m.awayTeam) continue;
    const fm = byPair.get(pairKey(m.homeTeam, m.awayTeam));
    if (!fm) continue;

    const isKnockout = m.round && m.round !== 'group';
    // Kun hent tidslinje når en knockout AFGØRES nu på forlænget tid/straffe
    // (ellers er 90-min = fuldtid, eller kampen er allerede afsluttet hos os).
    let timeline = null;
    if (!venueOnly && isKnockout && fm.status === 'finished' && m.status !== 'finished'
        && (fm.resultType === 'extraTime' || fm.resultType === 'penalties')) {
      try { timeline = await client.getTimeline(fm.externalId); } catch { /* → review */ }
    }

    const { action, patch } = venueOnly
      ? { action: 'skip', patch: null }
      : decideFifaUpdate(m, fm, timeline, { now, koSyncVersion });
    const resultChanged = !!patch && action !== 'skip' && patchChangesDoc(m, patch);

    // Stadion/by: skriv når det mangler/afviger — uafhængigt af resultat-action.
    const venuePatch = {};
    if (fm.venue && (m.venue || null) !== fm.venue) venuePatch.venue = fm.venue;
    if (fm.city && (m.city || null) !== fm.city) venuePatch.city = fm.city;

    if (!resultChanged && Object.keys(venuePatch).length === 0) continue;
    if (action === 'review') review++;

    const writeData = { ...(resultChanged ? patch : {}), ...venuePatch };
    changes.push({
      id: m.id, action,
      ...(resultChanged ? { result: patch.result, status: patch.status } : {}),
      ...(venuePatch.venue ? { venue: venuePatch.venue } : {}),
    });
    if (!dryRun) {
      await db.collection('matches').doc(m.id).update({ ...writeData, autoUpdatedAt: FieldValue.serverTimestamp() });
    }
    updated++;
  }
  return { source: 'fifa', checked: ours.length, updated, review, changes };
}

/**
 * FIFA-kampdetaljesynk — henter opstillinger/mål/kort fra live/football (+ tidslinje)
 * og skriver match.details. RØRER IKKE resultatet — det ejer resultatsynken.
 * Idempotent på detalje-indhold.
 *
 * Standard (skemalagt): kampe i tidsvinduet + en LILLE portion afsluttede kampe
 * uden detaljer (backfill), hvor den 96-doc-brede backfill-scan kun køres hvert
 * 10. minut (sparer Firestore-læsninger). `full`=true genhenter detaljer for ALLE
 * parrede kampe (også dem der allerede har detaljer) — til engangs-genhentning.
 */
// Har kampen det NYE detalje-skema (efter data-oplåsningen)? Bruges til at genhente
// kampe med forældet skema — både i den skemalagte backfill og i den manuelle resync.
const hasCurrentShape = (m) => !!(m.details && Array.isArray(m.details.goals) && m.details.playerStats);

async function runFifaDetailsSync(db, { now = new Date(), windowBeforeH = 3.5, windowAfterMin = 75, maxBackfill = 8, maxWrites = Infinity, full = false } = {}) {
  const client = createFifaClient();
  const { byPair } = await fetchFifaByPair(client);

  const targets = new Map();
  if (full) {
    // Genhent alle kampe der mangler det NYE skema — RESUMERBART: hvert kald tager en
    // afgrænset portion (maxWrites), så det ikke rammer timeout, og gentagne kald
    // konvergerer efterhånden som kampene får det fulde billede.
    const allSnap = await db.collection('matches').get();
    for (const d of allSnap.docs) {
      const m = { id: d.id, ...d.data() };
      if (m.homeTeam && m.awayTeam && !hasCurrentShape(m)) targets.set(m.id, m);
    }
  } else {
    const fromTs = Timestamp.fromMillis(now.getTime() - windowBeforeH * 3600 * 1000);
    const toTs = Timestamp.fromMillis(now.getTime() + windowAfterMin * 60 * 1000);
    const windowSnap = await db.collection('matches')
      .where('kickoff', '>=', fromTs).where('kickoff', '<=', toTs).get();
    for (const d of windowSnap.docs) {
      const m = { id: d.id, ...d.data() };
      if (m.homeTeam && m.awayTeam) targets.set(m.id, m);
    }
    // Backfill af afsluttede kampe uden detaljer — kun hvert 10. minut (den brede
    // scan er dyr), så vi ikke læser hele samlingen hvert minut.
    if (now.getMinutes() % 10 === 0) {
      const finishedSnap = await db.collection('matches').where('status', '==', 'finished').get();
      let backfilled = 0;
      for (const d of finishedSnap.docs) {
        if (backfilled >= maxBackfill) break;
        if (targets.has(d.id)) continue;
        const m = { id: d.id, ...d.data() };
        // Genhent kampe uden detaljer ELLER med forældet skema (selv-helende backfill).
        if (m.homeTeam && m.awayTeam && !hasCurrentShape(m)) { targets.set(m.id, m); backfilled++; }
      }
    }
  }

  // Én kamp ad gangen, fejltolerant: en enkelt kamp der fejler (netværk, for stor
  // skrivning m.m.) stopper ikke hele kørslen. Afgrænset af maxWrites, så det
  // manuelle "gen-hent alle" ikke rammer timeout — kald igen for resten.
  let updated = 0; let errors = 0; let processed = 0;
  const prLen = (dd) => (Array.isArray(dd?.powerRanking) ? dd.powerRanking.length : (dd?.powerRanking?.outfield?.length || 0));
  const sig = (dd) => JSON.stringify([
    dd?.goals || [], dd?.lineups || null, dd?.bookings || [], dd?.substitutions || [],
    dd?.events?.length || 0, dd?.minute ?? null, dd?.stats || null, prLen(dd),
    dd?.statsRaw ? Object.keys(dd.statsRaw.home || {}).length : 0, dd?.attendance ?? null,
    dd?.playerStats ? Object.keys(dd.playerStats).length : 0,
  ]);
  for (const m of targets.values()) {
    if (updated >= maxWrites) break;
    processed++;
    const fm = byPair.get(pairKey(m.homeTeam, m.awayTeam));
    if (!fm) continue;
    try {
      const live = await client.getMatch(fm.externalId);
      const timeline = await client.getTimeline(fm.externalId).catch(() => null);
      const details = fifaMap.mapMatchDetails(live, timeline);
      if (!details) continue;
      const idIFES = live.Properties && live.Properties.IdIFES;
      if (idIFES) {
        const [teamsJson, prJson, playersJson] = await Promise.all([
          client.getMatchStats(idIFES).catch(() => null),
          client.getPowerRanking(idIFES).catch(() => null),
          client.getPlayerStats(idIFES).catch(() => null),
        ]);
        const hid = live.HomeTeam && live.HomeTeam.IdTeam;
        if (teamsJson) {
          details.stats = fifaMap.mapTeamStats(teamsJson, hid);
          details.statsRaw = fifaMap.mapTeamStatsRaw(teamsJson, hid); // hele feltsættet (~141/hold)
        }
        if (prJson) details.powerRanking = fifaMap.mapPowerRanking(prJson, hid);
        if (playersJson) details.playerStats = fifaMap.mapPlayerStats(playersJson, live); // ~61 felter/spiller
      }
      // full=true tvinger genskrivning (remap slår igennem); ellers kun ved reel ændring.
      if (!full && sig(m.details) === sig(details)) continue;
      await db.collection('matches').doc(m.id).set({ details, detailsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      updated++;
    } catch { errors++; }
  }
  const remaining = Math.max(0, targets.size - processed);
  return { source: 'fifa', targets: targets.size, updated, errors, remaining };
}

/**
 * FIFA knockout-holdudfyldning — fylder hjemme/ude-hold ind på TBD-knockout-kampe
 * når FIFA har afgjort dem. Vores knockout-slots og FIFA's deler ikke id, så vi
 * matcher på bracket-position = samme runde + nærmeste kickoff (hver slot har et
 * distinkt tidspunkt). Ikke-destruktiv: rører aldrig manuelt låste/spillede kampe.
 */
async function runFifaKnockoutTeams(db) {
  const client = createFifaClient();
  const cal = await client.getSeasonMatches({ count: 500 });
  const fifaKO = [];
  for (const raw of (Array.isArray(cal?.Results) ? cal.Results : [])) {
    const fm = fifaMap.mapCalendarMatch(raw);
    if (fm && fm.round && fm.round !== 'group' && fm.homeTeam && fm.awayTeam && fm.kickoffISO) fifaKO.push(fm);
  }

  // Kun kampe der mangler hold (pendingTeams) skal fyldes — så vi ikke scanner
  // hele samlingen hvert minut. Det er præcis TBD-knockout-pladserne.
  const snap = await db.collection('matches').where('status', '==', 'pendingTeams').get();
  let updated = 0; const ids = [];
  for (const d of snap.docs) {
    const m = { id: d.id, ...d.data() };
    const isKnockout = m.round && m.round !== 'group';
    if (!isKnockout || m.manualLock || m.result) continue;
    const ourMs = kickoffMs(m.kickoff);
    if (Number.isNaN(ourMs)) continue;

    const best = selectKnockoutFill({ round: m.round, kickoffMs: ourMs }, fifaKO);
    if (!best) continue;
    if (m.homeTeam === best.homeTeam && m.awayTeam === best.awayTeam) continue; // uændret

    await db.collection('matches').doc(m.id).set({
      homeTeam: best.homeTeam, awayTeam: best.awayTeam,
      homePlaceholder: null, awayPlaceholder: null, status: 'scheduled',
      venue: best.venue || null,
    }, { merge: true });
    updated++; ids.push(m.id);
  }
  return { source: 'fifa', updated, ids };
}

module.exports = {
  getDataSource, fetchFifaByPair, pairKey,
  runFifaResultsSync, runFifaDetailsSync, runFifaKnockoutTeams,
  selectKnockoutFill, bracketBucket,
};
