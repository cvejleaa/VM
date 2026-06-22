// ---------------------------------------------------------------------------
// Alternativt point-regnskab ("alt. stilling"): kig på hvert holds antal mål.
//   - Rigtigt 0          → +2 point  (så man ikke for let havner i minus)
//   - Rigtigt N (N>0)    → +N point
//   - Forkert            → − |tip − faktisk|
// Pr. kamp summeres hjemme- og udeholdets bidrag. Pr. spiller summeres alle
// kampe, hvor spilleren har afgivet et gyldigt tip.
// ---------------------------------------------------------------------------

/**
 * Point for ÉT holds måltal.
 * @param {number} predicted  tippet antal mål for holdet
 * @param {number} actual     faktisk antal mål for holdet
 * @returns {number}
 */
export function altTeamPoints(predicted, actual) {
  if (predicted == null || actual == null) return 0;
  const p = Number(predicted);
  const a = Number(actual);
  if (!Number.isFinite(p) || !Number.isFinite(a)) return 0;
  const diff = Math.abs(p - a);
  if (diff === 0) return a === 0 ? 2 : a; // rigtigt: 0 giver +2, ellers +antal mål
  return -diff; // forkert: minus forskellen
}

/**
 * Point for én kamp (hjemme + ude). Returnerer 0 hvis tip eller resultat mangler.
 * @param {{home:number, away:number}} bet
 * @param {{home:number, away:number}} result
 * @returns {number}
 */
export function altMatchPoints(bet, result) {
  if (!bet || !result) return 0;
  if (!Number.isFinite(bet.home) || !Number.isFinite(bet.away)) return 0;
  return altTeamPoints(bet.home, result.home) + altTeamPoints(bet.away, result.away);
}

/**
 * Alternativ stilling pr. spiller over alle afsluttede kampe.
 * @param {Array<object>} matches  kampe med .id og .result
 * @param {Map<string,Array>|{get?:Function}} betsByMatch  matchId → bets[]
 * @param {Record<string,object>} usersById  uid → {displayName}
 * @returns {Array<{uid,name,points,matches,avg}>} sorteret faldende efter point
 */
export function computeAltStandings(matches, betsByMatch, usersById) {
  const byUid = new Map();
  for (const m of matches || []) {
    if (!m || !m.result) continue;
    const bets = betsByMatch?.get?.(m.id) || [];
    for (const b of bets) {
      if (!b.uid || !Number.isFinite(b.home) || !Number.isFinite(b.away)) continue;
      const row = byUid.get(b.uid) || { uid: b.uid, points: 0, matches: 0 };
      row.points += altMatchPoints(b, m.result);
      row.matches += 1;
      byUid.set(b.uid, row);
    }
  }
  return [...byUid.values()]
    .map((r) => ({
      ...r,
      name: usersById?.[r.uid]?.displayName || 'Spiller',
      avg: r.matches ? Math.round((r.points / r.matches) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'));
}
