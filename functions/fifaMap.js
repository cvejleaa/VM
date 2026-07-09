// ---------------------------------------------------------------------------
// fifaMap.js — ren, testbar oversættelse fra FIFA's offentlige data-API til
// VORES normaliserede skema. INGEN netværk/Firebase — nem at teste isoleret mod
// rigtige FIFA-svar (se __fixtures__/fifa/).
//
// FIFA-kilder (gratis, ingen nøgle):
//   • api.fifa.com/api/v3/calendar/matches?idSeason=…  → kampprogram + resultater
//   • api.fifa.com/api/v3/live/football/{matchId}       → detaljer (opstilling, mål, kort)
//   • api.fifa.com/api/v3/timelines/{matchId}           → hændelses-tidslinje m. PERIODE
//
// Vigtigt: FIFA tagger hver hændelse med `Period` (3=1. halvleg, 5=2. halvleg,
// 7/9=forlænget tid, 11=straffe). Det gør 90-min-resultatet (som knockout-tip
// måles på) EKSAKT — vi behøver ikke gætte ud fra minuttal.
// ---------------------------------------------------------------------------
'use strict';

// Regulær spilletid = 1. + 2. halvleg. Bruges til at isolere 90-min-resultatet.
const REGULAR_PERIODS = new Set([3, 5]);

// FIFA ResultType → hvordan kampen blev afgjort.
const RESULT_TYPE = { 0: 'notPlayed', 1: 'regular', 2: 'penalties', 3: 'extraTime' };

/** Pluk en lokaliseret streng ('en' foretrukket) fra FIFA's [{Locale,Description}]. */
function loc(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const en = list.find((x) => x && typeof x.Locale === 'string' && x.Locale.startsWith('en'));
  return (en || list[0]).Description ?? null;
}

/** FIFA-stadienavn/StageName → vores round-kode ('group'|'r32'|…|'final') eller null. */
function stageToRound(stageName) {
  const s = String(stageName == null ? '' : stageName).toLowerCase();
  if (!s) return null;
  if (s.includes('group')) return 'group';
  if (s.includes('32')) return 'r32';
  if (s.includes('16')) return 'r16';
  if (s.includes('quarter')) return 'qf';
  if (s.includes('semi')) return 'sf';
  if (s.includes('third') || s.includes('3rd')) return 'bronze';
  if (s.includes('final')) return 'final'; // efter quarter/semi/third
  return null;
}

/** Vores 3-bogstavskode for et FIFA-hold (IdCountry foretrukket, ellers Abbreviation). */
function teamCode(team) {
  if (!team) return null;
  const c = team.IdCountry || team.Abbreviation || null;
  return c ? String(c).toUpperCase() : null;
}

/** ResultType-tal → 'regular'|'penalties'|'extraTime'|'notPlayed'. */
function resultType(rt) {
  return RESULT_TYPE[rt] || 'notPlayed';
}

/**
 * Vores status for en FIFA-kamp.
 *  MatchStatus: 0 = spillet/afsluttet, 1 = ikke startet. Andet (fx live) → 'live'.
 *  Uden kendte hold bliver en ikke-spillet kamp 'pendingTeams'.
 * NB: den præcise live-kode er endnu ikke bekræftet mod en igangværende kamp —
 * derfor behandles alt der hverken er 0 eller 1 som live (konservativt).
 */
function mapStatus(matchStatus, hasTeams) {
  if (matchStatus === 0) return 'finished';
  if (matchStatus === 1) return hasTeams ? 'scheduled' : 'pendingTeams';
  return 'live';
}

/**
 * 90-minutters (ordinær tid) resultat fra tidslinjen: den løbende score ved
 * udgangen af 2. halvleg. Robust over for selvmål (den løbende HomeGoals/AwayGoals
 * er allerede korrekt bogført). Returnerer null hvis der ikke er ordinær-tids-data.
 * @param {{Event:Array}} timeline
 * @returns {{home:number, away:number}|null}
 */
function ninetyScore(timeline) {
  const evs = timeline && Array.isArray(timeline.Event) ? timeline.Event : null;
  if (!evs) return null;
  let home = null; let away = null;
  for (const ev of evs) {
    if (!REGULAR_PERIODS.has(ev.Period)) continue;
    const hg = Number(ev.HomeGoals); const ag = Number(ev.AwayGoals);
    if (Number.isFinite(hg)) home = home == null ? hg : Math.max(home, hg);
    if (Number.isFinite(ag)) away = away == null ? ag : Math.max(away, ag);
  }
  if (home == null || away == null) return null;
  return { home, away };
}

/**
 * Normalisér én FIFA-kalenderkamp til vores skema (samme form som football-data-
 * importens "desired": kode-hold, kickoff, stadion, runde, status, resultat).
 * @param {object} m  ét element fra calendar/matches → Results
 */
function mapCalendarMatch(m) {
  if (!m) return null;
  const home = teamCode(m.Home);
  const away = teamCode(m.Away);
  const hasTeams = !!home && !!away;
  // FIFA navngiver gruppespils-stadiet ikke altid "Group …" i StageName, men
  // gruppekampe har ALTID en gruppe (IdGroup/GroupName) — det er det sikre signal.
  let round = stageToRound(loc(m.StageName));
  if (!round && (m.IdGroup != null || loc(m.GroupName))) round = 'group';
  const status = mapStatus(m.MatchStatus, hasTeams);

  // Vinder → vores holdkode (til "videre" i knockout).
  let advance = null;
  if (m.Winner) {
    if (m.Home && String(m.Home.IdTeam) === String(m.Winner)) advance = home;
    else if (m.Away && String(m.Away.IdTeam) === String(m.Winner)) advance = away;
  }

  const played = m.MatchStatus === 0 && m.HomeTeamScore != null && m.AwayTeamScore != null;
  const pens = (m.HomeTeamPenaltyScore != null && m.AwayTeamPenaltyScore != null)
    ? { home: m.HomeTeamPenaltyScore, away: m.AwayTeamPenaltyScore } : null;

  return {
    externalId: String(m.IdMatch),
    idStage: m.IdStage != null ? String(m.IdStage) : null,
    round,
    homeTeam: home,
    awayTeam: away,
    homePlaceholder: home ? null : (m.PlaceHolderA || null),
    awayPlaceholder: away ? null : (m.PlaceHolderB || null),
    kickoffISO: m.Date || null,
    venue: m.Stadium ? loc(m.Stadium.Name) : null,
    city: m.Stadium ? loc(m.Stadium.CityName) : null,
    groupName: loc(m.GroupName),
    status,
    matchStatusRaw: m.MatchStatus ?? null,
    resultType: resultType(m.ResultType),
    // Rå løbende score (kan være sat for LIVE-kampe, ikke kun afsluttede) — bruges
    // af synken til foreløbige live-resultater.
    homeScore: m.HomeTeamScore != null ? Number(m.HomeTeamScore) : null,
    awayScore: m.AwayTeamScore != null ? Number(m.AwayTeamScore) : null,
    result: played
      ? { home: m.HomeTeamScore, away: m.AwayTeamScore, ...(advance ? { advance } : {}), ...(pens ? { penalties: pens } : {}) }
      : null,
  };
}

/** Parse FIFA-minut ("79'" / "90'+6'") → {minute, injuryTime}. */
function parseMinute(s) {
  const m = String(s == null ? '' : s).match(/(\d+)(?:'?\+(\d+))?/);
  if (!m) return { minute: null, injuryTime: null };
  return { minute: Number(m[1]), injuryTime: m[2] ? Number(m[2]) : null };
}

/** FIFA Card-tal → vores kode. 1 = gult; alt andet = udvisning. */
function cardCode(card) {
  return card === 1 ? 'YELLOW' : 'RED';
}

// Store hændelser (fremhæves/vises som standard i feed'et): mål, straffemål,
// kort, udskiftning, straffe tildelt, VAR, kampslut.
const MAJOR_EVENT_TYPES = new Set([0, 41, 2, 5, 6, 71, 26]);

/**
 * Live hændelses-feed fra tidslinjen: hver kommentar-værdig hændelse (mål, skud,
 * redninger, hjørner, offside, kort, udskiftninger, VAR …) med FIFA's egen tekst.
 * @param {object} timeline    /timelines/{id}
 * @param {string} homeIdTeam  hjemmeholdets IdTeam (til side)
 */
function mapTimelineEvents(timeline, homeIdTeam) {
  const evs = timeline && Array.isArray(timeline.Event) ? timeline.Event : [];
  const out = [];
  for (const e of evs) {
    const text = loc(e.EventDescription);
    if (!text) continue; // kun hændelser med kommentar
    const { minute, injuryTime } = parseMinute(e.MatchMinute);
    out.push({
      minute, injuryTime, period: e.Period ?? null,
      side: e.IdTeam == null ? null : (String(e.IdTeam) === String(homeIdTeam) ? 'home' : 'away'),
      type: e.Type ?? null,
      label: loc(e.TypeLocalized),
      text,
      home: e.HomeGoals ?? null, away: e.AwayGoals ?? null,
      major: MAJOR_EVENT_TYPES.has(e.Type),
    });
  }
  return out;
}

/**
 * Kampdetaljer fra FIFA (live/football + timeline) i PRÆCIS samme form som
 * football-datas mapMatchDetails, så MatchDetails-visningen renderer uændret:
 * mål (med scorer-navn + running score), kort, udskiftninger, opstillinger
 * (startelver/bænk/formation), straffe, spilleminut og 90-min.
 * @param {object} live      /live/football/{id}-svar
 * @param {object} [timeline] /timelines/{id}-svar (for eksakt 90-min)
 */
function mapMatchDetails(live, timeline) {
  if (!live) return null;
  const ht = live.HomeTeam || {}; const at = live.AwayTeam || {};

  // IdPlayer → navn (fra begge holds spillere).
  const names = new Map();
  for (const p of [...(ht.Players || []), ...(at.Players || [])]) {
    if (p.IdPlayer) names.set(String(p.IdPlayer), loc(p.ShortName) || loc(p.PlayerName) || null);
  }
  const nameOf = (id) => (id != null ? names.get(String(id)) || null : null);

  // Kampmål — men UDELAD straffesparkskonkurrencen (Period 11): FIFA lægger den
  // ind i holdenes Goals, og den hører hjemme i "Straffe"-summen, ikke i mål-feed'et.
  const mapGoals = (arr, side) => (arr || []).filter((g) => g.Period !== 11).map((g) => {
    const { minute, injuryTime } = parseMinute(g.Minute);
    return { minute, injuryTime, type: 'REGULAR', side, scorer: nameOf(g.IdPlayer), assist: nameOf(g.IdAssistPlayer) };
  });
  const mapBookings = (arr, side) => (arr || []).map((b) => {
    const { minute } = parseMinute(b.Minute);
    return { minute, side, player: nameOf(b.IdPlayer), card: cardCode(b.Card) };
  });
  const mapSubs = (arr, side) => (arr || []).map((s) => {
    const { minute, injuryTime } = parseMinute(s.Minute);
    return { minute, injuryTime, side, playerIn: loc(s.PlayerOnName), playerOut: loc(s.PlayerOffName) };
  });
  const team = (t) => ({
    formation: t?.Tactics ?? null,
    coach: loc(t?.Coaches?.[0]?.Name || t?.Coaches?.[0]?.CoachName) || null,
    lineup: (t?.Players || []).filter((p) => p.Status === 1)
      .map((p) => ({ name: loc(p.ShortName) || loc(p.PlayerName), position: p.Position ?? null, shirt: p.ShirtNumber ?? null, x: p.LineupX ?? null, y: p.LineupY ?? null, captain: !!p.Captain })),
    bench: (t?.Players || []).filter((p) => p.Status === 2)
      .map((p) => ({ name: loc(p.ShortName) || loc(p.PlayerName), position: p.Position ?? null, shirt: p.ShirtNumber ?? null })),
  });

  const pens = (live.HomeTeamPenaltyScore != null && live.AwayTeamPenaltyScore != null)
    ? { home: live.HomeTeamPenaltyScore, away: live.AwayTeamPenaltyScore } : null;
  const { minute, injuryTime } = parseMinute(live.MatchTime);

  return {
    goals: [...mapGoals(ht.Goals, 'home'), ...mapGoals(at.Goals, 'away')],
    bookings: [...mapBookings(ht.Bookings, 'home'), ...mapBookings(at.Bookings, 'away')],
    substitutions: [...mapSubs(ht.Substitutions, 'home'), ...mapSubs(at.Substitutions, 'away')],
    lineups: { home: team(ht), away: team(at) },
    penalties: pens,
    resultType: resultType(live.ResultType),
    minute, injuryTime, // spilleminut til live-badgen
    period: live.Period ?? null,
    events: mapTimelineEvents(timeline, ht.IdTeam), // live hændelses-feed
    ninety: ninetyScore(timeline),
  };
}

/**
 * Ordinær-tids-resultat + "videre" for en knockout-kamp ud fra FIFA-data
 * (parallel til vores healedKnockoutResult, men med eksakt periode-data).
 * @param {object} match     mappet kalenderkamp (fra mapCalendarMatch) — for hold/advance
 * @param {object} timeline  /timelines/{id}
 * @returns {{home:number, away:number, advance:string|null}|null}
 */
function knockoutResult(match, timeline) {
  if (!match) return null;
  const ninety = ninetyScore(timeline);
  if (!ninety) return null;
  let advance = match.result && match.result.advance ? match.result.advance : null;
  const pens = match.result && match.result.penalties;
  if (pens && pens.home !== pens.away) {
    advance = pens.home > pens.away ? match.homeTeam : match.awayTeam;
  } else if (ninety.home !== ninety.away) {
    advance = ninety.home > ninety.away ? match.homeTeam : match.awayTeam;
  }
  return { home: ninety.home, away: ninety.away, advance: advance || null };
}

/**
 * Hvilket FIFA-resultat skal et tip scores IMOD — på samme grundlag som i dag
 * (ordinær tid for knockout)? Bruges af skygge-scoringen der sammenligner
 * FIFA-afledte point med de nuværende UDEN at skrive noget.
 *  - Gruppekamp → fuldtidsresultatet (ingen forlænget tid i gruppespil).
 *  - Knockout afgjort i ordinær tid → resultatet som det er (= 90-min).
 *  - Knockout på forlænget tid/straffe → 90-min fra tidslinjen (knockoutResult).
 *    Mangler tidslinjen, returneres null (kalderen springer over/flagger) — vi
 *    scorer ALDRIG på et oppustet fuldtidsresultat.
 * @param {object} fm        mappet FIFA-kamp (fra mapCalendarMatch)
 * @param {object} [timeline] /timelines/{id} (kræves kun for ET/straffe)
 * @returns {{home:number, away:number, advance?:string|null}|null}
 */
function fifaScoringResult(fm, timeline) {
  if (!fm || !fm.result) return null;
  const isKnockout = fm.round && fm.round !== 'group';
  if (!isKnockout) return { home: fm.result.home, away: fm.result.away };
  if (fm.resultType === 'extraTime' || fm.resultType === 'penalties') {
    return timeline ? knockoutResult(fm, timeline) : null;
  }
  return { home: fm.result.home, away: fm.result.away, advance: fm.result.advance || null };
}

module.exports = {
  loc, stageToRound, teamCode, resultType, mapStatus, parseMinute, cardCode,
  ninetyScore, mapCalendarMatch, mapMatchDetails, mapTimelineEvents, knockoutResult,
  fifaScoringResult,
};
