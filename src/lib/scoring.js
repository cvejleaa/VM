// ---------------------------------------------------------------------------
// Delt, ren pointlogik (ingen Firebase-afhængigheder).
// Bruges af frontend til at vise mulige point, OG spejles 1:1 i Cloud Functions
// (functions/scoring.js) som den autoritative beregning. Hold dem identiske!
// ---------------------------------------------------------------------------

export const POINTS = {
  EXACT: 5, // helt korrekt score
  GOAL_DIFF: 3, // korrekt udfald + korrekt målforskel (men ikke eksakt)
  OUTCOME: 2, // korrekt udfald (1-X-2), forkert målforskel
  WRONG: 0,
  KNOCKOUT_ADVANCE: 2, // korrekt "hvem går videre" i knockout
  BONUS: 10, // pr. korrekt bonus-svar (topscorer / gruppevinder)
};

/** Returnerer 'home' | 'draw' | 'away' for en score. */
export function outcome(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/**
 * Beregner point for et score-tip mod et facit.
 * @param {{home:number, away:number}} bet  spillerens tip
 * @param {{home:number, away:number}} result  det faktiske resultat (ordinær tid)
 * @returns {number}
 */
export function scoreMatch(bet, result) {
  if (!bet || !result) return 0;
  if (
    !Number.isFinite(bet.home) || !Number.isFinite(bet.away) ||
    !Number.isFinite(result.home) || !Number.isFinite(result.away)
  ) return 0;

  if (bet.home === result.home && bet.away === result.away) return POINTS.EXACT;

  const sameOutcome = outcome(bet.home, bet.away) === outcome(result.home, result.away);
  if (!sameOutcome) return POINTS.WRONG;

  const sameDiff = bet.home - bet.away === result.home - result.away;
  return sameDiff ? POINTS.GOAL_DIFF : POINTS.OUTCOME;
}

/**
 * Samlet point for en knockout-kamp: score-point + evt. point for korrekt
 * "hvem går videre".
 * @param {{home:number, away:number, advance?:string}} bet
 * @param {{home:number, away:number, advance?:string}} result
 */
export function scoreKnockout(bet, result) {
  let pts = scoreMatch(bet, result);
  if (bet?.advance && result?.advance && bet.advance === result.advance) {
    pts += POINTS.KNOCKOUT_ADVANCE;
  }
  return pts;
}

/** Normaliser et bonus-svar: trim + små bogstaver (tolerant matchning). */
function normalizeAnswer(v) {
  return String(v).trim().toLowerCase();
}

/** Point for et bonus-svar (ufølsomt for store/små bogstaver og mellemrum). */
export function scoreBonus(answer, facit) {
  if (answer == null || facit == null) return 0;
  if (normalizeAnswer(answer) === '' || normalizeAnswer(facit) === '') return 0;
  return normalizeAnswer(answer) === normalizeAnswer(facit) ? POINTS.BONUS : 0;
}
