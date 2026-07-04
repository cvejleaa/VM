// ---------------------------------------------------------------------------
// fixtureImport.js — ren, testbar logik til at hente de RIGTIGE knockout-kampe
// fra football-data i stedet for at generere bracketten lokalt.
//
// Idéen: gruppekampene hos os er korrekte og kan parres med football-data
// (matchFixture). Derfra "lærer" vi football-datas hold-id → vores 3-bogstavs-
// kode for alle 48 hold. Knockout-kampene fra football-data oversættes så til
// vores skema og afstemmes mod de eksisterende knockout-dokumenter.
// ---------------------------------------------------------------------------
'use strict';

// football-data /matches `stage` → vores `round`. Liberal mod varianter.
const STAGE_TO_ROUND = {
  GROUP_STAGE: 'group',
  GROUP: 'group',
  LAST_32: 'r32',
  ROUND_OF_32: 'r32',
  LAST_16: 'r16',
  ROUND_OF_16: 'r16',
  QUARTER_FINALS: 'qf',
  QUARTER_FINAL: 'qf',
  SEMI_FINALS: 'sf',
  SEMI_FINAL: 'sf',
  THIRD_PLACE: 'bronze',
  '3RD_PLACE': 'bronze',
  PLAY_OFF_FOR_THIRD_PLACE: 'bronze',
  FINAL: 'final',
};

/** football-data stage → vores round ('group'|'r32'|...|'final') eller null. */
function stageToRound(stage) {
  if (!stage) return null;
  return STAGE_TO_ROUND[String(stage).toUpperCase()] || null;
}

/**
 * Lær football-data hold-id → vores holdkode ud fra de (korrekte) gruppekampe.
 * @param {Array<object>} ourGroupMatches  vores gruppekampe (homeTeam/awayTeam = kode)
 * @param {Array<object>} fdMatches        football-data-kampe
 * @param {Function} matchFixture          (ourMatch, fdMatches) → fd-kamp | null
 * @returns {Map<number,string>} fdTeamId → vores kode
 */
function learnCodes(ourGroupMatches, fdMatches, matchFixture) {
  const map = new Map();
  for (const m of ourGroupMatches || []) {
    const fd = matchFixture(m, fdMatches);
    if (!fd) continue;
    if (fd.homeTeam && fd.homeTeam.id != null && m.homeTeam) map.set(fd.homeTeam.id, m.homeTeam);
    if (fd.awayTeam && fd.awayTeam.id != null && m.awayTeam) map.set(fd.awayTeam.id, m.awayTeam);
  }
  return map;
}

/** Oversæt et football-data-hold til vores kode (lært map, ellers TLA-fallback). */
function resolveCode(fdTeam, learned) {
  if (!fdTeam) return null;
  if (fdTeam.id != null && learned && learned.has(fdTeam.id)) return learned.get(fdTeam.id);
  const tla = String(fdTeam.tla || '').toUpperCase();
  return /^[A-Z]{3}$/.test(tla) ? tla : null;
}

/** ms fra Timestamp/Date/ISO/ms, ellers NaN. */
function kickoffMs(kickoff) {
  if (kickoff == null) return NaN;
  if (typeof kickoff.toDate === 'function') return kickoff.toDate().getTime();
  if (kickoff instanceof Date) return kickoff.getTime();
  const n = typeof kickoff === 'number' ? kickoff : Date.parse(kickoff);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Byg de ØNSKEDE knockout-dokumenter ud fra football-datas kampe.
 * @param {Array<object>} fdMatches
 * @param {(fdTeam:object)=>string|null} codeOf
 * @returns {Array<{id,round,homeTeam,awayTeam,homePlaceholder,awayPlaceholder,kickoffISO,externalId,status}>}
 */
function buildDesiredKnockout(fdMatches, codeOf) {
  const out = [];
  for (const fd of fdMatches || []) {
    const round = stageToRound(fd.stage);
    if (!round || round === 'group') continue;
    if (fd.id == null) continue;
    const home = codeOf(fd.homeTeam) || null;
    const away = codeOf(fd.awayTeam) || null;
    const teamsKnown = !!home && !!away;
    out.push({
      id: `ko_${fd.id}`,
      round,
      homeTeam: home,
      awayTeam: away,
      homePlaceholder: home ? null : (fd.homeTeam?.name || null),
      awayPlaceholder: away ? null : (fd.awayTeam?.name || null),
      kickoffISO: fd.utcDate || null,
      externalId: String(fd.id),
      status: teamsKnown ? 'scheduled' : 'pendingTeams',
      // Stadion er statisk planlægningsdata — kendt (og udfyldt af football-data)
      // allerede før holdene er afgjort, så vi kan importere det med det samme.
      venue: fd.venue ?? null,
    });
  }
  return out;
}

/** Afviger en eksisterende kamp fra det ønskede (hold/runde/tid/id/status/venue)? */
function differs(existing, desired) {
  return existing.homeTeam !== desired.homeTeam
    || existing.awayTeam !== desired.awayTeam
    || existing.round !== desired.round
    || String(existing.externalId ?? '') !== String(desired.externalId ?? '')
    || existing.status !== desired.status
    || (existing.venue ?? null) !== (desired.venue ?? null)
    || kickoffMs(existing.kickoff) !== kickoffMs(desired.kickoffISO);
}

/**
 * Er en eksisterende kamp SPILLET eller LÅST? Sådanne kampe må importen aldrig
 * røre — ellers ville en allerede afsluttet kamp (eller en manuelt rettet) blive
 * sat tilbage til "scheduled" og resultater/låsninger gå tabt. (buildDesiredKnockout
 * sætter altid status='scheduled', så uden denne beskyttelse flagges enhver
 * afsluttet kamp evigt til opdatering.)
 */
function isPlayedOrLocked(e) {
  return !!(e && (e.manualLock || e.result || e.status === 'finished' || e.status === 'live'));
}

/**
 * Afstem eksisterende knockout-kampe mod de ønskede (fra football-data).
 * Spillede/låste kampe beskyttes: de hverken opdateres eller slettes.
 * @param {Array<object>} existingKnockout  vores nuværende knockout-dokumenter
 * @param {Array<object>} desired           output fra buildDesiredKnockout
 * @returns {{toCreate:Array, toUpdate:Array, toDelete:string[]}}
 */
function reconcileKnockout(existingKnockout, desired) {
  const desiredById = new Map((desired || []).map((d) => [d.id, d]));
  const existingById = new Map((existingKnockout || []).map((e) => [e.id, e]));
  const toCreate = [];
  const toUpdate = [];
  const toDelete = [];
  for (const d of desired || []) {
    const e = existingById.get(d.id);
    if (!e) toCreate.push(d);
    else if (differs(e, d) && !isPlayedOrLocked(e)) toUpdate.push(d);
  }
  for (const e of existingKnockout || []) {
    if (!desiredById.has(e.id) && !isPlayedOrLocked(e)) toDelete.push(e.id);
  }
  return { toCreate, toUpdate, toDelete };
}

/**
 * Ikke-destruktiv variant til den løbende auto-synk: returnér kun knockout-kampe
 * hvor BEGGE hold nu er kendt og afviger fra vores (eller hvor vi mangler kampen).
 * Rører ALDRIG kampe med manuel lås eller med et resultat (spillede kampe), og
 * sletter aldrig noget.
 * @param {Array<object>} existingKnockout
 * @param {Array<object>} desired  output fra buildDesiredKnockout
 * @returns {Array<object>} delmængde af desired der skal skrives
 */
function knockoutTeamUpdates(existingKnockout, desired) {
  const byId = new Map((existingKnockout || []).map((e) => [e.id, e]));
  const updates = [];
  for (const d of desired || []) {
    if (!d.homeTeam || !d.awayTeam) continue; // kun når begge hold er kendt
    const e = byId.get(d.id);
    if (!e) { updates.push(d); continue; } // mangler hos os → tilføj
    if (e.manualLock) continue;             // admin har låst → rør ikke
    if (e.result) continue;                 // spillet kamp → rør ikke
    if (e.homeTeam === d.homeTeam && e.awayTeam === d.awayTeam) continue; // uændret
    updates.push(d);
  }
  return updates;
}

module.exports = {
  STAGE_TO_ROUND,
  stageToRound,
  learnCodes,
  resolveCode,
  kickoffMs,
  buildDesiredKnockout,
  differs,
  isPlayedOrLocked,
  reconcileKnockout,
  knockoutTeamUpdates,
};
