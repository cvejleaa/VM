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
