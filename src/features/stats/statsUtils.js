// ---------------------------------------------------------------------------
// Rene statistik-funktioner (ingen Firebase). Bruges af Statistik-siden.
// ---------------------------------------------------------------------------
import { outcome, scoreMatch, scoreKnockout, POINTS } from '../../lib/scoring';
import { ROUNDS } from '../../lib/constants';
import { TEAMS, teamName } from '../../lib/teams';

/**
 * Beregner statistik for én afgjort kamp ud fra spillernes tips.
 * @param {object} match  kamp med .result {home,away,advance?} og .round
 * @param {Array<object>} bets  tips for kampen: {uid, home, away, advance?}
 * @returns {{
 *   total:number, exact:number, exactPct:number,
 *   correctOutcome:number, outcomePct:number,
 *   avgPoints:number, popular:{home:number,away:number,count:number}|null,
 *   exactUids:string[]
 * }}
 */
export function computeMatchStats(match, bets) {
  const result = match?.result;
  const list = Array.isArray(bets) ? bets : [];
  const total = list.length;
  if (!result || total === 0) {
    return { total, exact: 0, exactPct: 0, correctOutcome: 0, outcomePct: 0, avgPoints: 0, popular: null, exactUids: [] };
  }

  const isKnockout = match.round && match.round !== ROUNDS.GROUP;
  const resOutcome = outcome(result.home, result.away);

  let exact = 0;
  let correctOutcome = 0;
  let pointsSum = 0;
  const exactUids = [];
  const tally = new Map(); // "h-a" -> count

  for (const b of list) {
    const pts = isKnockout ? scoreKnockout(b, result, match) : scoreMatch(b, result);
    pointsSum += pts;

    if (b.home === result.home && b.away === result.away) {
      exact += 1;
      if (b.uid) exactUids.push(b.uid);
    }
    if (
      Number.isFinite(b.home) && Number.isFinite(b.away) &&
      outcome(b.home, b.away) === resOutcome
    ) {
      correctOutcome += 1;
    }
    if (Number.isFinite(b.home) && Number.isFinite(b.away)) {
      const key = `${b.home}-${b.away}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }

  // Mest populære tip
  let popular = null;
  for (const [key, count] of tally) {
    if (!popular || count > popular.count) {
      const [h, a] = key.split('-').map(Number);
      popular = { home: h, away: a, count };
    }
  }

  const pct = (n) => Math.round((n / total) * 100);
  return {
    total,
    exact,
    exactPct: pct(exact),
    correctOutcome,
    outcomePct: pct(correctOutcome),
    avgPoints: Math.round((pointsSum / total) * 10) / 10,
    pointsSum,
    popular,
    exactUids,
  };
}

/**
 * Point pr. spiller for et givent sæt kampe (kun afsluttede tæller).
 * @param {Array<object>} matches
 * @param {Map<string,Array>|{get?:Function}} betsByMatch  matchId -> bets[]
 * @returns {Record<string,number>} uid -> point
 */
export function pointsByUidForMatches(matches, betsByMatch) {
  const out = {};
  for (const m of finishedWithResult(matches)) {
    const isKo = m.round && m.round !== ROUNDS.GROUP;
    for (const b of betsByMatch?.get?.(m.id) ?? []) {
      if (!b.uid) continue;
      out[b.uid] = (out[b.uid] ?? 0) + (isKo ? scoreKnockout(b, m.result, m) : scoreMatch(b, m.result));
    }
  }
  return out;
}

/**
 * Find de spillere der fik flest point i dag.
 * @param {Record<string,number>} pointsByUid
 * @param {Record<string,object>} usersById  uid -> {displayName}
 * @param {number} [limit]
 * @returns {Array<{uid:string, name:string, points:number}>}
 */
export function topScorersOfDay(pointsByUid, usersById, limit = 3) {
  return Object.entries(pointsByUid ?? {})
    .filter(([, p]) => p > 0)
    .map(([uid, points]) => ({ uid, points, name: usersById?.[uid]?.displayName || 'Spiller' }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'))
    .slice(0, limit);
}

/** Maksimalt mulige point for en kamp (til "X af Y"-visning). */
export function maxPointsForMatch(match) {
  const isKnockout = match?.round && match.round !== ROUNDS.GROUP;
  return isKnockout ? POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE : POINTS.EXACT;
}

// ─── Sæson-statistik (hele turneringen) ─────────────────────────────────────

/** Kun afsluttede kampe med gyldigt resultat. */
function finishedWithResult(matches) {
  return (matches ?? []).filter((m) => m && m.result);
}

/**
 * Samlet overblik på tværs af alle afsluttede kampe.
 * @returns {{matches:number, tips:number, exact:number, correctOutcome:number,
 *            exactPct:number, outcomePct:number, totalPoints:number, avgPoints:number}}
 */
export function computeSeasonOverview(matches, betsByMatch) {
  const finished = finishedWithResult(matches);
  let tips = 0, exact = 0, correctOutcome = 0, totalPoints = 0;
  for (const m of finished) {
    const s = computeMatchStats(m, betsByMatch?.get?.(m.id) ?? []);
    tips += s.total;
    exact += s.exact;
    correctOutcome += s.correctOutcome;
    totalPoints += s.pointsSum;
  }
  const pct = (n) => (tips ? Math.round((n / tips) * 100) : 0);
  return {
    matches: finished.length,
    tips,
    exact,
    correctOutcome,
    exactPct: pct(exact),
    outcomePct: pct(correctOutcome),
    totalPoints,
    avgPoints: tips ? Math.round((totalPoints / tips) * 10) / 10 : 0,
  };
}

/**
 * Per-spiller træfsikkerhed over hele turneringen.
 * @returns {Array<{uid,name,tips,exact,correctOutcome,points,exactPct,outcomePct,avgPoints}>}
 */
export function computePlayerAccuracy(matches, betsByMatch, usersById) {
  const finished = finishedWithResult(matches);
  const byUid = new Map();
  for (const m of finished) {
    const isKo = m.round && m.round !== ROUNDS.GROUP;
    const res = m.result;
    for (const b of betsByMatch?.get?.(m.id) ?? []) {
      if (!b.uid) continue;
      const row = byUid.get(b.uid) ?? { uid: b.uid, tips: 0, exact: 0, correctOutcome: 0, points: 0 };
      row.tips += 1;
      row.points += isKo ? scoreKnockout(b, res, m) : scoreMatch(b, res);
      if (b.home === res.home && b.away === res.away) row.exact += 1;
      if (Number.isFinite(b.home) && Number.isFinite(b.away) && outcome(b.home, b.away) === outcome(res.home, res.away)) {
        row.correctOutcome += 1;
      }
      byUid.set(b.uid, row);
    }
  }
  return [...byUid.values()]
    .map((r) => ({
      ...r,
      name: usersById?.[r.uid]?.displayName || 'Spiller',
      exactPct: r.tips ? Math.round((r.exact / r.tips) * 100) : 0,
      outcomePct: r.tips ? Math.round((r.correctOutcome / r.tips) * 100) : 0,
      avgPoints: r.tips ? Math.round((r.points / r.tips) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name, 'da'));
}

/**
 * Mest overraskende resultat: den afsluttede kamp hvor færrest ramte udfaldet
 * (mindst `minTips` tips). Returnerer {match, stats} eller null.
 */
export function mostSurprising(matches, betsByMatch, minTips = 3) {
  let best = null;
  for (const m of finishedWithResult(matches)) {
    const stats = computeMatchStats(m, betsByMatch?.get?.(m.id) ?? []);
    if (stats.total < minTips) continue;
    if (!best || stats.outcomePct < best.stats.outcomePct ||
        (stats.outcomePct === best.stats.outcomePct && stats.exactPct < best.stats.exactPct)) {
      best = { match: m, stats };
    }
  }
  return best;
}

/**
 * Bedst forudsagte kamp: flest ramte eksakt score (mindst `minTips` tips).
 * Returnerer {match, stats} eller null.
 */
export function bestPredicted(matches, betsByMatch, minTips = 3) {
  let best = null;
  for (const m of finishedWithResult(matches)) {
    const stats = computeMatchStats(m, betsByMatch?.get?.(m.id) ?? []);
    if (stats.total < minTips) continue;
    if (!best || stats.exactPct > best.stats.exactPct ||
        (stats.exactPct === best.stats.exactPct && stats.outcomePct > best.stats.outcomePct)) {
      best = { match: m, stats };
    }
  }
  return best;
}

/**
 * Disciplin-statistik (kort) ud fra kampdetaljer (match.details.bookings).
 * Røde vægter tungest. Returnerer top-hold og top-spillere samt totaler.
 * @param {Array<object>} matches  kampe med evt. .details.bookings[] og .homeTeam/.awayTeam
 * @returns {{ teams: Array, players: Array, totals: {yellow:number, red:number} }}
 */
export function computeDiscipline(matches) {
  const byTeam = {};
  const byPlayer = {};
  for (const m of matches ?? []) {
    const bookings = m?.details?.bookings;
    if (!Array.isArray(bookings)) continue;
    for (const b of bookings) {
      const teamCode = b.side === 'home' ? m.homeTeam : b.side === 'away' ? m.awayTeam : null;
      const isRed = b.card === 'RED' || b.card === 'YELLOW_RED';
      const isYellow = b.card === 'YELLOW';
      if (teamCode) {
        byTeam[teamCode] = byTeam[teamCode] || { code: teamCode, yellow: 0, red: 0 };
        if (isYellow) byTeam[teamCode].yellow++;
        if (isRed) byTeam[teamCode].red++;
      }
      if (b.player) {
        byPlayer[b.player] = byPlayer[b.player] || { name: b.player, team: teamCode, yellow: 0, red: 0 };
        if (isYellow) byPlayer[b.player].yellow++;
        if (isRed) byPlayer[b.player].red++;
      }
    }
  }
  const score = (x) => x.red * 2 + x.yellow; // røde kort vægter tungest
  const bySeverity = (a, b) => score(b) - score(a) || b.red - a.red
    || teamName(a.code).localeCompare(teamName(b.code), 'da');
  const teams = Object.values(byTeam).sort(bySeverity);
  const players = Object.values(byPlayer).sort(bySeverity);
  const totals = teams.reduce(
    (acc, t) => ({ yellow: acc.yellow + t.yellow, red: acc.red + t.red }),
    { yellow: 0, red: 0 },
  );

  // Alle deltagende nationer (gyldige landekoder fra kampene) med deres kort —
  // også dem med 0, så man kan se hele feltet.
  const nationCodes = new Set();
  for (const m of matches ?? []) {
    for (const code of [m?.homeTeam, m?.awayTeam]) {
      if (code && TEAMS[code]) nationCodes.add(code);
    }
  }
  const allTeams = [...nationCodes]
    .map((code) => byTeam[code] || { code, yellow: 0, red: 0 })
    .sort(bySeverity);

  return { teams, players, totals, allTeams };
}

// ─── Turnerings-fakta (uafhængigt af vores tip-spil) ────────────────────────

/** Alle mål på tværs af kampe (fra details.goals), evt. beriget med kampens hold. */
function allGoals(matches) {
  const out = [];
  for (const m of matches ?? []) {
    const goals = m?.details?.goals;
    if (!Array.isArray(goals)) continue;
    for (const g of goals) out.push({ ...g, home: m.homeTeam, away: m.awayTeam, matchId: m.id });
  }
  return out;
}

const INTERVAL_BINS = ['0-15', '16-30', '31-45', '45+', '46-60', '61-75', '76-90', '90+'];

/** Hvilket minut-interval hører et mål til? Returnerer en label fra INTERVAL_BINS eller null. */
function goalBin(minute, injuryTime) {
  if (minute == null) return null;
  if (injuryTime > 0 && minute <= 45) return '45+';
  if (injuryTime > 0 && minute >= 46) return '90+';
  if (minute > 90) return '90+';
  if (minute <= 15) return '0-15';
  if (minute <= 30) return '16-30';
  if (minute <= 45) return '31-45';
  if (minute <= 60) return '46-60';
  if (minute <= 75) return '61-75';
  return '76-90';
}

/**
 * Fordel alle mål på minut-intervaller (bins) på tværs af alle kampe.
 * @param {Array<object>} matches
 * @returns {{ bins: Array<{label:string,count:number,pct:number}>, total:number, peak:object|null }}
 */
export function computeGoalsByInterval(matches) {
  const counts = Object.fromEntries(INTERVAL_BINS.map((b) => [b, 0]));
  let total = 0;
  // Kun afgjorte kampe — samme sæt som computeTournamentFacts, så "mål i alt"
  // stemmer på tværs af kortene (live-kampes mål tælles ikke med her).
  for (const g of allGoals(finishedWithResult(matches))) {
    const bin = goalBin(g.minute, g.injuryTime);
    if (!bin) continue;
    counts[bin] += 1;
    total += 1;
  }
  const bins = INTERVAL_BINS.map((label) => ({
    label, count: counts[label], pct: total ? Math.round((counts[label] / total) * 100) : 0,
  }));
  let peak = null;
  for (const b of bins) if (b.count > 0 && (!peak || b.count > peak.count)) peak = b;
  return { bins, total, peak };
}

/**
 * Samlede turnerings-nøgletal ud fra afsluttede kampe + kampdetaljer.
 * @param {Array<object>} matches
 */
export function computeTournamentFacts(matches) {
  const finished = finishedWithResult(matches);
  const played = finished.length;

  // ALLE mål-tal (i alt, hjemme/ude, typer, tidligste/seneste) tælles fra samme
  // kilde: kampenes mål-feed (details.goals), over de afgjorte kampe. Så stemmer
  // "mål i alt" med typefordelingen OG minut-fordelingen. Mål-feedet indeholder
  // også mål i forlænget tid (straffesparkskonkurrence er filtreret fra i mapningen)
  // — modsat resultatets scoringer, der for knockout er 90-minutters-tallet.
  let homeGoals = 0;
  let awayGoals = 0;
  let totalGoals = 0;
  const typeBreakdown = { regular: 0, penalty: 0, own: 0 };
  const resultTally = new Map(); // "hi-lo" -> count (det viste slutresultat)
  let earliest = null;
  let latest = null;

  for (const m of finished) {
    const hi = Math.max(m.result.home, m.result.away);
    const lo = Math.min(m.result.home, m.result.away);
    resultTally.set(`${hi}-${lo}`, (resultTally.get(`${hi}-${lo}`) ?? 0) + 1);

    const goals = Array.isArray(m?.details?.goals) ? m.details.goals : [];
    for (const g of goals) {
      totalGoals += 1;
      // Eget mål tæller for MODSTANDEREN (som på tavlen).
      const scoringSide = g.type === 'OWN' ? (g.side === 'home' ? 'away' : 'home') : g.side;
      if (scoringSide === 'home') homeGoals += 1;
      else if (scoringSide === 'away') awayGoals += 1;

      if (g.type === 'PENALTY') typeBreakdown.penalty += 1;
      else if (g.type === 'OWN') typeBreakdown.own += 1;
      else typeBreakdown.regular += 1;

      if (g.minute != null) {
        const key = g.minute * 100 + (g.injuryTime || 0);
        const eg = { ...g, home: m.homeTeam, away: m.awayTeam, matchId: m.id, _k: key };
        if (!earliest || key < earliest._k) earliest = eg;
        if (!latest || key > latest._k) latest = eg;
      }
    }
  }

  const frequentResults = [...resultTally.entries()]
    .map(([score, count]) => ({ score, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    played,
    totalGoals,
    goalsPerMatch: played ? Math.round((totalGoals / played) * 10) / 10 : 0,
    homeGoals,
    awayGoals,
    typeBreakdown,
    frequentResults,
    earliest,
    latest,
  };
}

/** Udfald (HOME/AWAY/DRAW) af et {home,away}-scoreobjekt. */
function sideOutcome(home, away) {
  if (home > away) return 'HOME';
  if (away > home) return 'AWAY';
  return 'DRAW';
}

/**
 * 2.-halvlegs-statistik: kampe hvor stillingen ændrede sig efter pausen,
 * comebacks (hold bagud ved pausen der endte med at vinde) og clean sheets.
 * @param {Array<object>} matches
 */
export function computeSecondHalfStats(matches) {
  const finished = finishedWithResult(matches);
  let changedAfterHalf = 0;
  let withHalfTime = 0;
  const comebacks = [];
  for (const m of finished) {
    const ht = m.details?.halfTime;
    if (ht && ht.home != null && ht.away != null) {
      withHalfTime += 1;
      const htO = sideOutcome(ht.home, ht.away);
      const ftO = sideOutcome(m.result.home, m.result.away);
      if (htO !== ftO) changedAfterHalf += 1;
      // Comeback: bagud ved pausen, vandt til slut.
      if (htO === 'HOME' && ftO === 'AWAY') comebacks.push({ match: m, team: m.awayTeam });
      if (htO === 'AWAY' && ftO === 'HOME') comebacks.push({ match: m, team: m.homeTeam });
    }
  }

  // Clean sheets pr. hold (afsluttede kampe uden indkasserede mål).
  const cs = {};
  for (const m of finished) {
    if (m.homeTeam && m.result.away === 0) cs[m.homeTeam] = (cs[m.homeTeam] ?? 0) + 1;
    if (m.awayTeam && m.result.home === 0) cs[m.awayTeam] = (cs[m.awayTeam] ?? 0) + 1;
  }
  const cleanSheets = Object.entries(cs)
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count);

  return { withHalfTime, changedAfterHalf, comebacks, cleanSheets };
}

/**
 * "Hidsigste" kampe: flest kort (rødt vægter dobbelt). Top `limit`.
 * @param {Array<object>} matches
 * @param {number} [limit]
 */
export function computeFieryMatches(matches, limit = 5) {
  const rows = [];
  for (const m of matches ?? []) {
    const bookings = m?.details?.bookings;
    if (!Array.isArray(bookings) || bookings.length === 0) continue;
    let yellow = 0;
    let red = 0;
    for (const b of bookings) {
      if (b.card === 'YELLOW') yellow += 1;
      else if (b.card === 'RED' || b.card === 'YELLOW_RED') red += 1;
    }
    rows.push({ match: m, yellow, red, weight: red * 2 + yellow });
  }
  return rows.sort((a, b) => b.weight - a.weight || b.red - a.red).slice(0, limit);
}

/**
 * Dommerstatistik: antal kampe + kort pr. dommer (fra details.referee/bookings).
 * @param {Array<object>} matches
 */
export function computeRefereeStats(matches) {
  const byRef = {};
  for (const m of matches ?? []) {
    const ref = m?.details?.referee;
    if (!ref) continue;
    byRef[ref] = byRef[ref] || { name: ref, matches: 0, yellow: 0, red: 0 };
    byRef[ref].matches += 1;
    for (const b of m.details.bookings ?? []) {
      if (b.card === 'YELLOW') byRef[ref].yellow += 1;
      else if (b.card === 'RED' || b.card === 'YELLOW_RED') byRef[ref].red += 1;
    }
  }
  return Object.values(byRef).sort((a, b) => b.matches - a.matches || (b.yellow + b.red) - (a.yellow + a.red));
}

/**
 * Per-land opgørelse over de afsluttede kampe: mål for/imod, straffemål (scoret),
 * selvmål for/imod og gule/røde kort. Bygger på kampenes mål-feed + kort.
 * Selvmål er gemt på målscorerens side og krediteres modstanderen (som i visningen);
 * "selvmål for" = selvmål der gav landet et mål, "selvmål imod" = eget mål begået af
 * landets spiller. Alle deltagende nationer får en række (også ved 0).
 * @param {Array<object>} matches
 * @returns {{ list: Array<object>, totals: object }}
 */
export function computeCountryStats(matches) {
  const finished = finishedWithResult(matches);
  const rows = {};
  const flip = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : s);
  const row = (code) => {
    rows[code] = rows[code] || { code, goalsFor: 0, goalsAgainst: 0, penaltyFor: 0, ownFor: 0, ownAgainst: 0, yellow: 0, red: 0 };
    return rows[code];
  };

  for (const m of finished) {
    const teamOf = (side) => (side === 'home' ? m.homeTeam : side === 'away' ? m.awayTeam : null);
    for (const code of [m.homeTeam, m.awayTeam]) if (code && TEAMS[code]) row(code); // også nationer med 0

    for (const g of (Array.isArray(m?.details?.goals) ? m.details.goals : [])) {
      // Selvmål er gemt på målscorerens side → modtageren er modstanderen.
      const benef = teamOf(g.type === 'OWN' ? flip(g.side) : g.side);
      const concede = teamOf(g.type === 'OWN' ? g.side : flip(g.side));
      if (benef && TEAMS[benef]) row(benef).goalsFor += 1;
      if (concede && TEAMS[concede]) row(concede).goalsAgainst += 1;
      if (g.type === 'PENALTY' && benef && TEAMS[benef]) row(benef).penaltyFor += 1;
      if (g.type === 'OWN') {
        if (benef && TEAMS[benef]) row(benef).ownFor += 1;
        const scorer = teamOf(g.side); // målscorerens hold begik selvmålet
        if (scorer && TEAMS[scorer]) row(scorer).ownAgainst += 1;
      }
    }
    for (const b of (Array.isArray(m?.details?.bookings) ? m.details.bookings : [])) {
      const t = teamOf(b.side);
      if (!t || !TEAMS[t]) continue;
      if (b.card === 'YELLOW') row(t).yellow += 1;
      else if (b.card === 'RED' || b.card === 'YELLOW_RED') row(t).red += 1;
    }
  }

  const list = Object.values(rows).sort((a, b) =>
    b.goalsFor - a.goalsFor
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || teamName(a.code).localeCompare(teamName(b.code), 'da'));

  const totals = list.reduce((acc, r) => {
    for (const k of ['goalsFor', 'goalsAgainst', 'penaltyFor', 'ownFor', 'ownAgainst', 'yellow', 'red']) acc[k] += r[k];
    return acc;
  }, { goalsFor: 0, goalsAgainst: 0, penaltyFor: 0, ownFor: 0, ownAgainst: 0, yellow: 0, red: 0 });

  return { list, totals };
}

// ─── Fase 1: hurtige gevinster (bygger på data vi allerede har) ──────────────

const flipS = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : s);

/** Løbende stilling efter hvert mål (minut-sorteret); selvmål krediteres modstanderen. */
function runningScoreSeq(goals) {
  const sorted = [...(Array.isArray(goals) ? goals : [])]
    .sort((a, b) => ((a.minute ?? 999) - (b.minute ?? 999)) || ((a.injuryTime ?? 0) - (b.injuryTime ?? 0)));
  let h = 0; let a = 0; const seq = [];
  for (const g of sorted) {
    const s = g.type === 'OWN' ? flipS(g.side) : g.side;
    if (s === 'home') h += 1; else if (s === 'away') a += 1;
    seq.push({ home: h, away: a });
  }
  return seq;
}

/**
 * xG over/underpræstation pr. land: summeret faktiske mål vs. summeret xG over de
 * afsluttede kampe DER HAR statistik (så xG og mål dækker samme kampe). diff>0 =
 * klinisk (scorede mere end forventet), diff<0 = sløsede chancer.
 */
export function computeXgOverUnder(matches) {
  const rows = {};
  const row = (c) => (rows[c] = rows[c] || { code: c, xg: 0, goals: 0 });
  for (const m of finishedWithResult(matches)) {
    const st = m?.details?.stats;
    if (!st || st.home?.xg == null || st.away?.xg == null) continue; // kun kampe med xG
    const goals = Array.isArray(m?.details?.goals) ? m.details.goals : [];
    const gf = { home: 0, away: 0 };
    for (const g of goals) {
      const s = g.type === 'OWN' ? flipS(g.side) : g.side;
      if (s === 'home' || s === 'away') gf[s] += 1;
    }
    if (m.homeTeam && TEAMS[m.homeTeam]) { row(m.homeTeam).xg += st.home.xg; row(m.homeTeam).goals += gf.home; }
    if (m.awayTeam && TEAMS[m.awayTeam]) { row(m.awayTeam).xg += st.away.xg; row(m.awayTeam).goals += gf.away; }
  }
  return Object.values(rows)
    .map((r) => ({ code: r.code, xg: Math.round(r.xg * 10) / 10, goals: r.goals, diff: Math.round((r.goals - r.xg) * 10) / 10 }))
    .filter((r) => r.xg > 0 || r.goals > 0)
    .sort((a, b) => b.diff - a.diff || b.goals - a.goals);
}

/**
 * Turneringens rekorder: hurtigste + seneste mål, største sejr, mål-rigeste kamp,
 * største comeback (størst underskud vendt af den endelige vinder). Fra mål-feed +
 * resultat over de afsluttede kampe.
 */
export function computeRecords(matches) {
  let fastest = null; let latest = null; let biggestWin = null; let highest = null; let comeback = null;
  for (const m of finishedWithResult(matches)) {
    const label = { id: m.id, home: m.homeTeam, away: m.awayTeam };
    const rh = Number(m.result.home) || 0; const ra = Number(m.result.away) || 0;
    const total = rh + ra; const score = `${rh}-${ra}`;
    if (!highest || total > highest.total) highest = { ...label, total, score };
    const margin = Math.abs(rh - ra);
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) biggestWin = { ...label, margin, score };

    const goals = Array.isArray(m?.details?.goals) ? m.details.goals : [];
    for (const g of goals) {
      if (g.minute == null) continue;
      const key = g.minute * 100 + (g.injuryTime || 0);
      const stamp = { ...label, key, minute: g.minute, injuryTime: g.injuryTime || 0, scorer: g.scorer || null };
      if (!fastest || key < fastest.key) fastest = stamp;
      if (!latest || key > latest.key) latest = stamp;
    }
    if (rh !== ra && goals.length) {
      const winner = rh > ra ? 'home' : 'away';
      let maxDeficit = 0;
      for (const s of runningScoreSeq(goals)) {
        const d = winner === 'home' ? s.away - s.home : s.home - s.away;
        if (d > maxDeficit) maxDeficit = d;
      }
      if (maxDeficit > 0 && (!comeback || maxDeficit > comeback.deficit)) {
        comeback = { ...label, deficit: maxDeficit, winner: winner === 'home' ? m.homeTeam : m.awayTeam, score };
      }
    }
  }
  return { fastest, latest, biggestWin, highest, comeback };
}

/**
 * Kampens spiller → turneringens MVP: hvor mange gange hver spiller toppede
 * power-indekset. Håndterer både gammelt (liste) og nyt ({outfield}) format.
 */
export function computeMvpTally(matches) {
  const tally = {};
  for (const m of finishedWithResult(matches)) {
    const pr = m?.details?.powerRanking;
    const outfield = Array.isArray(pr) ? pr : (pr?.outfield ?? []);
    const top = outfield[0];
    if (!top || !top.name) continue;
    const code = top.side === 'home' ? m.homeTeam : top.side === 'away' ? m.awayTeam : null;
    const t = (tally[top.name] = tally[top.name] || { name: top.name, count: 0, picture: top.picture || null, code: code || null, id: top.id || null });
    t.count += 1;
    if (!t.picture && top.picture) t.picture = top.picture;
    if (!t.code && code) t.code = code;
    if (!t.id && top.id) t.id = top.id;
  }
  return Object.values(tally).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'da'));
}

// ─── Fase 3: turneringens målmand + straffesparkstavle ──────────────────────

/**
 * Turneringens målmand: aggregér FIFA-power-index for målmænd (powerRanking.
 * goalkeepers) pr. keeper over de afsluttede kampe. Sorteret efter gennemsnitlig
 * "defending the goal"-score. Kræver det nye power-index-format (efter gen-hentning).
 */
export function computeGoalkeeperRanking(matches, minMatches = 1) {
  const gks = {};
  for (const m of finishedWithResult(matches)) {
    const pr = m?.details?.powerRanking;
    const list = (pr && !Array.isArray(pr) && Array.isArray(pr.goalkeepers)) ? pr.goalkeepers : [];
    for (const g of list) {
      if (!g.name) continue;
      const code = g.side === 'home' ? m.homeTeam : g.side === 'away' ? m.awayTeam : null;
      const k = (gks[g.name] = gks[g.name] || { name: g.name, code: code || null, picture: g.picture || null, id: g.id || null, matches: 0, defSum: 0, totalSum: 0, best: 0 });
      k.matches += 1; k.defSum += g.defending || 0; k.totalSum += g.total || 0;
      if ((g.defending || 0) > k.best) k.best = g.defending || 0;
      if (!k.code && code) k.code = code;
      if (!k.picture && g.picture) k.picture = g.picture;
      if (!k.id && g.id) k.id = g.id;
    }
  }
  return Object.values(gks)
    .filter((k) => k.matches >= minMatches)
    .map((k) => ({ name: k.name, code: k.code, picture: k.picture, id: k.id, matches: k.matches, best: Math.round(k.best * 10) / 10,
      avgDef: Math.round((k.defSum / k.matches) * 10) / 10, avgTotal: Math.round((k.totalSum / k.matches) * 10) / 10 }))
    .sort((a, b) => b.avgDef - a.avgDef || b.matches - a.matches || a.name.localeCompare(b.name, 'da'));
}

/**
 * Straffesparkskonkurrencer: pr. kamp med Period-11-hændelser → spark-for-spark
 * (scoret Type 41 / brændt Type 60) med skytte + side. Plus en tælling af hvem der
 * brændte flest. Kræver spillernavne på hændelserne (efter gen-hentning).
 */
export function computePenaltyShootouts(matches) {
  const shootouts = [];
  const takers = {};
  for (const m of finishedWithResult(matches)) {
    const evs = (Array.isArray(m?.details?.events) ? m.details.events : [])
      .filter((e) => e.period === 11 && (e.type === 41 || e.type === 60));
    if (evs.length === 0) continue;
    const kicks = evs.map((e) => {
      const scored = e.type === 41;
      const code = e.side === 'home' ? m.homeTeam : e.side === 'away' ? m.awayTeam : null;
      if (e.player) {
        const t = (takers[e.player] = takers[e.player] || { name: e.player, code: code || null, id: e.idPlayer || null, scored: 0, missed: 0 });
        if (scored) t.scored += 1; else t.missed += 1;
        if (!t.code && code) t.code = code;
        if (!t.id && e.idPlayer) t.id = e.idPlayer;
      }
      return { side: e.side, player: e.player || null, id: e.idPlayer || null, scored, code };
    });
    shootouts.push({
      id: m.id, home: m.homeTeam, away: m.awayTeam, kicks,
      homeScored: kicks.filter((k) => k.side === 'home' && k.scored).length,
      awayScored: kicks.filter((k) => k.side === 'away' && k.scored).length,
    });
  }
  const missers = Object.values(takers).filter((t) => t.missed > 0)
    .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name, 'da'));
  return { shootouts, missers };
}

// ─── Fase 3b: hold-stil-radar (fra statsRaw's spilfase-minutter) ─────────────

const STYLE_AXES = [
  { key: 'press', label: 'Højt pres', fields: ['PhaseAggregateHighPress'] },
  { key: 'buildup', label: 'Opspil', fields: ['PhaseAggregateBuildUpUnopposed', 'PhaseAggregateBuildUpOpposed'] },
  { key: 'progression', label: 'Fremdrift', fields: ['PhaseAggregateProgression'] },
  { key: 'finalThird', label: 'Sidste 3.-del', fields: ['PhaseAggregateFinalThird'] },
  { key: 'counter', label: 'Kontra', fields: ['PhaseAggregateCounterattack'] },
  { key: 'lowBlock', label: 'Lav blok', fields: ['PhaseAggregateLowBlock'] },
];

/**
 * Hold-stil pr. nation: gennemsnitlige spilfase-minutter (fra details.statsRaw)
 * over de afsluttede kampe, normaliseret 0-100 ift. det højeste hold pr. akse —
 * så radaren viser relativ stil (pres/opspil/fremdrift/sidste tredjedel/kontra/
 * lav blok). Kræver gen-hentning (statsRaw kom med data-oplåsningen).
 * @returns {{ axes: string[], teams: Array<{code, matches, values:number[]}> }}
 */
export function computeTeamStyles(matches) {
  const acc = {};
  for (const m of finishedWithResult(matches)) {
    const sr = m?.details?.statsRaw;
    if (!sr) continue;
    for (const [side, code] of [['home', m.homeTeam], ['away', m.awayTeam]]) {
      const raw = sr[side];
      if (!raw || !code || !TEAMS[code]) continue;
      const a = (acc[code] = acc[code] || { code, matches: 0, sums: {} });
      a.matches += 1;
      for (const ax of STYLE_AXES) {
        a.sums[ax.key] = (a.sums[ax.key] || 0) + ax.fields.reduce((s, f) => s + (Number(raw[f]) || 0), 0);
      }
    }
  }
  const teams = Object.values(acc).map((a) => {
    const avg = {};
    for (const ax of STYLE_AXES) avg[ax.key] = a.matches ? a.sums[ax.key] / a.matches : 0;
    return { code: a.code, matches: a.matches, avg };
  });
  if (teams.length === 0) return { axes: STYLE_AXES.map((a) => a.label), teams: [] };
  const max = {};
  for (const ax of STYLE_AXES) max[ax.key] = Math.max(1, ...teams.map((t) => t.avg[ax.key]));
  for (const t of teams) {
    t.values = STYLE_AXES.map((ax) => Math.round((t.avg[ax.key] / max[ax.key]) * 100));
    delete t.avg;
  }
  teams.sort((a, b) => teamName(a.code).localeCompare(teamName(b.code), 'da'));
  return { axes: STYLE_AXES.map((a) => a.label), teams };
}

// ─── Fase 4: spiller-leaderboards (fra details.playerStats) ─────────────────

/**
 * Spiller-toplister på tværs af de afsluttede kampe (fra details.playerStats):
 * flest skud, træfsikkerhed (%), assists, tophastighed og løbedistance. Nøglet på
 * playerId (stabilt), beriget med navn + land. Kræver gen-hentning.
 * @returns {{shots,accuracy,assists,topSpeed,distance:Array}}
 */
export function computePlayerLeaderboards(matches, { minShots = 4, topN = 10 } = {}) {
  const agg = {};
  for (const m of finishedWithResult(matches)) {
    const ps = m?.details?.playerStats;
    if (!ps || typeof ps !== 'object') continue;
    for (const [pid, p] of Object.entries(ps)) {
      if (!p || !p.name) continue;
      const code = p.side === 'home' ? m.homeTeam : p.side === 'away' ? m.awayTeam : null;
      const a = (agg[pid] = agg[pid] || { id: pid, name: p.name, code: code || null, matches: 0, shots: 0, onTarget: 0, assists: 0, goals: 0, topSpeed: 0, distance: 0, minutes: 0 });
      a.matches += 1;
      const s = p.stats || {};
      a.shots += Number(s.AttemptAtGoal) || 0;
      a.onTarget += Number(s.AttemptAtGoalOnTarget) || 0;
      a.assists += Number(s.Assists) || 0;
      a.goals += Number(s.Goals) || 0;
      a.topSpeed = Math.max(a.topSpeed, Number(s.TopSpeed) || 0);
      a.distance += Number(s.TotalDistance) || 0;
      a.minutes += Number(s.TimePlayed) || 0;
      if (!a.code && code) a.code = code;
    }
  }
  const players = Object.values(agg);
  const meta = (p) => ({ id: p.id, name: p.name, code: p.code, matches: p.matches });
  const board = (valFn, keep) => players.filter(keep).map((p) => ({ ...meta(p), value: valFn(p) }))
    .sort((a, b) => b.value - a.value).slice(0, topN);
  return {
    shots: board((p) => p.shots, (p) => p.shots > 0),
    accuracy: players.filter((p) => p.shots >= minShots)
      .map((p) => ({ ...meta(p), value: Math.round((p.onTarget / p.shots) * 100), sub: `${p.onTarget}/${p.shots}` }))
      .sort((a, b) => b.value - a.value).slice(0, topN),
    assists: board((p) => p.assists, (p) => p.assists > 0),
    topSpeed: players.filter((p) => p.topSpeed > 0)
      .map((p) => ({ ...meta(p), value: Math.round(p.topSpeed * 10) / 10 }))
      .sort((a, b) => b.value - a.value).slice(0, topN),
    distance: players.filter((p) => p.distance > 0)
      .map((p) => ({ ...meta(p), value: Math.round(p.distance / 1000) }))
      .sort((a, b) => b.value - a.value).slice(0, topN),
    // Arbejdsrate: løbedistance pr. spillet minut (m/min). Kræver ≥ 90 min i alt.
    workRate: players.filter((p) => p.minutes >= 90 && p.distance > 0)
      .map((p) => ({ ...meta(p), value: Math.round(p.distance / p.minutes), sub: `${Math.round(p.distance / 1000)} km / ${Math.round(p.minutes)} min` }))
      .sort((a, b) => b.value - a.value).slice(0, topN),
  };
}

/**
 * 🏆 Turneringens hold (bedste 11'er, 4-3-3) ud fra FIFA-power-indekset over de
 * afsluttede kampe. Hver markspiller aggregeres pr. kamp med gennemsnitlig
 * angrebs- (att), forsvars- (def) og kreativitets-score (cre). Rollerne udledes
 * af hvor spilleren er stærkest: angribere vælges på avgAtt, midtbane på avgCre,
 * forsvar på avgDef — grådigt og uden gengangere (en spiller kan kun stå i én
 * kæde). Målmanden er nr. 1 fra computeGoalkeeperRanking. Kræver det nye
 * power-index-format (efter gen-hentning); returnerer null hvis der er for få
 * spillere til en fuld 11'er.
 * @param {Array<object>} matches
 * @param {{minMatches?:number}} [opts]
 * @returns {{formation:string, gk:object|null, defenders:Array, midfielders:Array, forwards:Array}|null}
 */
export function computeTeamOfTournament(matches, { minMatches = 2 } = {}) {
  const agg = {};
  for (const m of finishedWithResult(matches)) {
    const pr = m?.details?.powerRanking;
    const outfield = Array.isArray(pr) ? pr : (pr?.outfield ?? []);
    for (const p of outfield) {
      if (!p || !p.name) continue;
      const key = p.id != null ? String(p.id) : p.name;
      const code = p.side === 'home' ? m.homeTeam : p.side === 'away' ? m.awayTeam : null;
      const a = (agg[key] = agg[key] || { id: p.id != null ? String(p.id) : null, name: p.name, code: code || null, picture: p.picture || null, matches: 0, attSum: 0, defSum: 0, creSum: 0, totalSum: 0 });
      a.matches += 1;
      a.attSum += Number(p.att) || 0;
      a.defSum += Number(p.def) || 0;
      a.creSum += Number(p.cre) || 0;
      a.totalSum += Number(p.total) || 0;
      if (!a.code && code) a.code = code;
      if (!a.picture && p.picture) a.picture = p.picture;
      if (!a.id && p.id != null) a.id = String(p.id);
    }
  }
  const mapAvg = (p) => ({
    id: p.id, name: p.name, code: p.code, picture: p.picture, matches: p.matches,
    avgAtt: Math.round((p.attSum / p.matches) * 10) / 10,
    avgDef: Math.round((p.defSum / p.matches) * 10) / 10,
    avgCre: Math.round((p.creSum / p.matches) * 10) / 10,
    avgTotal: Math.round((p.totalSum / p.matches) * 10) / 10,
  });
  const all = Object.values(agg);
  let pool = all.filter((p) => p.matches >= minMatches).map(mapAvg);
  if (pool.length < 10) pool = all.map(mapAvg); // for lidt data → slæk kampkravet
  if (pool.length < 10) return null; // stadig ikke nok markspillere til en 11'er

  const used = new Set();
  const uid = (p) => p.id ?? p.name;
  const pick = (metric, n) => {
    const chosen = pool.filter((p) => !used.has(uid(p)))
      .sort((a, b) => b[metric] - a[metric] || b.avgTotal - a.avgTotal || a.name.localeCompare(b.name, 'da'))
      .slice(0, n);
    for (const p of chosen) used.add(uid(p));
    return chosen;
  };
  // Grådig udvælgelse: angreb → midtbane → forsvar (uden gengangere).
  const forwards = pick('avgAtt', 3);
  const midfielders = pick('avgCre', 3);
  const defenders = pick('avgDef', 4);
  const gk = computeGoalkeeperRanking(matches)[0] || null;

  return { formation: '4-3-3', gk, defenders, midfielders, forwards };
}

/** Ét holds spillere aggregeret (mål, assists, skud) fra details.playerStats. */
export function computeTeamPlayers(matches, code, topN = 14) {
  const agg = {};
  for (const m of finishedWithResult(matches)) {
    if (m.homeTeam !== code && m.awayTeam !== code) continue;
    const side = m.homeTeam === code ? 'home' : 'away';
    const ps = m?.details?.playerStats;
    if (!ps || typeof ps !== 'object') continue;
    for (const [pid, p] of Object.entries(ps)) {
      if (!p || p.side !== side || !p.name) continue;
      const a = (agg[pid] = agg[pid] || { id: pid, name: p.name, matches: 0, goals: 0, assists: 0, shots: 0 });
      a.matches += 1;
      const s = p.stats || {};
      a.goals += Number(s.Goals) || 0;
      a.assists += Number(s.Assists) || 0;
      a.shots += Number(s.AttemptAtGoal) || 0;
    }
  }
  return Object.values(agg)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.shots - a.shots || a.name.localeCompare(b.name, 'da'))
    .slice(0, topN);
}

/**
 * Én spillers profil på tværs af de afsluttede kampe (fra details.playerStats):
 * navn, land, kampantal + summerede/afledte nøgletal + per-kamp-opdeling.
 * @returns {{id, name, code, matches, goals, assists, shots, onTarget, accuracy,
 *            topSpeed, distance, perMatch:Array}|null}
 */
export function computePlayerProfile(matches, id) {
  const key = String(id);
  let name = null; let code = null;
  let matchesCount = 0; let goals = 0; let assists = 0; let shots = 0; let onTarget = 0;
  let topSpeed = 0; let distance = 0; let minutes = 0;
  const perMatch = [];
  for (const m of finishedWithResult(matches)) {
    const p = m?.details?.playerStats && m.details.playerStats[key];
    if (!p) continue;
    matchesCount += 1;
    if (!name && p.name) name = p.name;
    const c = p.side === 'home' ? m.homeTeam : p.side === 'away' ? m.awayTeam : null;
    if (!code && c) code = c;
    const opp = p.side === 'home' ? m.awayTeam : m.homeTeam;
    const s = p.stats || {};
    const g = Number(s.Goals) || 0; const a = Number(s.Assists) || 0; const sh = Number(s.AttemptAtGoal) || 0;
    const ot = Number(s.AttemptAtGoalOnTarget) || 0; const ts = Number(s.TopSpeed) || 0; const dist = Number(s.TotalDistance) || 0;
    const min = Number(s.TimePlayed) || 0;
    goals += g; assists += a; shots += sh; onTarget += ot; distance += dist; minutes += min;
    if (ts > topSpeed) topSpeed = ts;
    perMatch.push({ id: m.id, opp: opp || null, goals: g, assists: a, shots: sh, onTarget: ot,
      topSpeed: Math.round(ts * 10) / 10, minutes: min ? Math.round(min) : null,
      perMin: min ? Math.round(dist / min) : null });
  }
  if (matchesCount === 0) return null;
  return {
    id: key, name, code, matches: matchesCount, goals, assists, shots, onTarget,
    accuracy: shots ? Math.round((onTarget / shots) * 100) : null,
    topSpeed: Math.round(topSpeed * 10) / 10, distance: Math.round(distance / 1000),
    minutes: Math.round(minutes), distancePerMin: minutes ? Math.round(distance / minutes) : null, perMatch,
  };
}
