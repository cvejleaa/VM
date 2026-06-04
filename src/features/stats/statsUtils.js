// ---------------------------------------------------------------------------
// Rene statistik-funktioner (ingen Firebase). Bruges af Statistik-siden.
// ---------------------------------------------------------------------------
import { outcome, scoreMatch, scoreKnockout, POINTS } from '../../lib/scoring';
import { ROUNDS } from '../../lib/constants';

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
    const pts = isKnockout ? scoreKnockout(b, result) : scoreMatch(b, result);
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
      row.points += isKo ? scoreKnockout(b, res) : scoreMatch(b, res);
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
