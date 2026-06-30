// ---------------------------------------------------------------------------
// Udled hver spillers FORUDSAGTE gruppevinder ud fra deres kamp-tips i grundspillet.
// Bruges til en admin-oversigt, så point for "rigtigt tippet gruppevinder" kan
// tilskrives spillere, der ikke nåede at svare på selve bonusspørgsmålet.
//
// En spillers forudsigelse tæller KUN med, hvis de har tippet ALLE 6 kampe i
// gruppen. Forudsigelsen er vinderen af deres egen forudsagte gruppestilling
// (samme rangering som den rigtige tabel: point → målforskel → scorede mål).
// ---------------------------------------------------------------------------
import { computeGroupStandings, grupperEfterGruppe } from '../tournament/computeStandings';
import { MATCH_STATUS } from '../../lib/constants';

/** Bets for en kamp (Map eller objekt-opslag). */
function betsForMatch(betsByMatch, matchId) {
  if (!betsByMatch) return [];
  return (betsByMatch.get ? betsByMatch.get(matchId) : betsByMatch[matchId]) ?? [];
}

/** Er et tip en gyldig score (to endelige tal — ikke null/tom)? */
function validBet(b) {
  if (!b || b.home == null || b.away == null || b.home === '' || b.away === '') return false;
  return Number.isFinite(Number(b.home)) && Number.isFinite(Number(b.away));
}

/** Topplaceringen er entydig, når nr. 1 står foran nr. 2 på point/MF/scorede mål. */
function isUnambiguous(standings) {
  const a = standings[0];
  const b = standings[1];
  if (!a) return false;
  if (!b) return true;
  return !(a.points === b.points && a.gd === b.gd && a.gf === b.gf);
}

/**
 * @param {Array<object>} matches  alle kampe (kun round==='group' bruges)
 * @param {Map<string,Array>|object} betsByMatch  matchId → bets[]
 * @returns {Array<{groupName:string, complete:boolean, actualWinner:string|null,
 *   predictions:Array<{uid:string, winner:string|null, ambiguous:boolean, correct:boolean|null}>}>}
 */
export function derivedGroupWinners(matches, betsByMatch) {
  const groups = grupperEfterGruppe(matches || []);
  const out = [];

  for (const [groupName, groupMatches] of groups) {
    // En standard-VM-gruppe har præcis 6 kampe; ellers springes den over.
    if (groupMatches.length !== 6) continue;

    const allFinished = groupMatches.every(
      (m) => m.status === MATCH_STATUS.FINISHED && m.result
        && Number.isFinite(Number(m.result.home)) && Number.isFinite(Number(m.result.away)),
    );
    const actualWinner = allFinished
      ? (computeGroupStandings(groupMatches)[0]?.team ?? null)
      : null;

    // Saml hver spillers gyldige tips for gruppens kampe.
    const byUid = new Map(); // uid → Map(matchId → bet)
    for (const m of groupMatches) {
      for (const b of betsForMatch(betsByMatch, m.id)) {
        if (!b.uid || !validBet(b)) continue;
        if (!byUid.has(b.uid)) byUid.set(b.uid, new Map());
        byUid.get(b.uid).set(m.id, b);
      }
    }

    const predictions = [];
    for (const [uid, betMap] of byUid) {
      if (betMap.size !== 6) continue; // skal have tippet ALLE 6 kampe

      const synthetic = groupMatches.map((m) => {
        const bet = betMap.get(m.id);
        return {
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          status: MATCH_STATUS.FINISHED,
          result: { home: Number(bet.home), away: Number(bet.away) },
        };
      });
      const standings = computeGroupStandings(synthetic);
      const winner = standings[0]?.team ?? null;
      const ambiguous = !isUnambiguous(standings);
      predictions.push({
        uid,
        winner,
        ambiguous,
        correct: actualWinner ? winner === actualWinner : null,
      });
    }

    out.push({ groupName, complete: allFinished, actualWinner, predictions });
  }

  return out;
}
