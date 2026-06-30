/**
 * Rene hjælpefunktioner til rangeringsberegninger.
 * Ingen Firebase-afhængigheder – nemme at teste isoleret.
 */

import { TIMEZONE } from '../../lib/constants';
import { scoreMatch, scoreKnockout, betAdvance, POINTS } from '../../lib/scoring';

/** ms fra et kickoff (Timestamp/Date/ISO). */
function kickoffMs(k) {
  const d = k?.toDate ? k.toDate() : new Date(k);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Opdel én kamps point i navngivne dele (til "udfold point"-visningen).
 * @param {{home:number, away:number, advance?:string}} bet
 * @param {{round?:string, result?:object, homeTeam?:string, awayTeam?:string}} match
 * @returns {{total:number, parts:Array<{label:string, points:number}>}}
 */
export function matchPointParts(bet, match) {
  const result = match?.result;
  if (!bet || !result) return { total: 0, parts: [] };
  const isKo = !!match.round && match.round !== 'group';
  const base = scoreMatch(bet, result);
  const parts = [];
  if (base === POINTS.EXACT) parts.push({ label: 'Eksakt resultat', points: POINTS.EXACT });
  else if (base === POINTS.GOAL_DIFF) parts.push({ label: 'Rigtig målforskel', points: POINTS.GOAL_DIFF });
  else if (base === POINTS.OUTCOME) parts.push({ label: 'Rigtig vinder', points: POINTS.OUTCOME });
  if (isKo) {
    const adv = betAdvance(bet, match);
    if (adv && result.advance && adv === result.advance) {
      parts.push({ label: 'Hvem går videre', points: POINTS.KNOCKOUT_ADVANCE });
    }
  }
  const total = parts.reduce((s, p) => s + p.points, 0);
  return { total, parts };
}

/**
 * Alle afsluttede kampe hvor en bruger har fået point, med opdeling pr. kamp.
 * Nyeste først. Bruges til den udfoldelige pointhøst i stillingen.
 * @param {string} uid
 * @param {Array<object>} matches  afsluttede kampe (med result)
 * @param {Map<string,Array>|object} betsByMatch  matchId -> bets[]
 * @returns {Array<{matchId,homeTeam,awayTeam,round,kickoff,bet,result,parts,total}>}
 */
export function userMatchBreakdown(uid, matches, betsByMatch) {
  if (!uid) return [];
  const getBets = (id) => (betsByMatch?.get ? betsByMatch.get(id) : betsByMatch?.[id]) ?? [];
  const out = [];
  for (const m of matches || []) {
    if (!m || !m.result) continue;
    const bet = getBets(m.id).find((b) => b && b.uid === uid);
    if (!bet) continue;
    const { total, parts } = matchPointParts(bet, m);
    if (total <= 0) continue;
    out.push({
      matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      round: m.round, kickoff: m.kickoff, bet, result: m.result, parts, total,
    });
  }
  out.sort((a, b) => kickoffMs(b.kickoff) - kickoffMs(a.kickoff));
  return out;
}

/**
 * Returnerer dags dato som 'YYYY-MM-DD' i Europe/Copenhagen-tidszonen.
 * @param {Date} [now]  – valgfri "nu"-dato; bruges i tests.
 */
export function getTodayInCPH(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: TIMEZONE }); // 'sv-SE' → ISO-format
}

/**
 * Filtrerer et array af brugerobjekter til kun dem,
 * der er med i det givne sæt af UIDs.
 *
 * @param {Array<{uid: string}>} users
 * @param {string[]|null|undefined} memberUids  – null/undefined → returner alle
 * @returns {Array<{uid: string}>}
 */
export function filterByMembers(users, memberUids) {
  if (!memberUids || memberUids.length === 0) return users;
  const set = new Set(memberUids);
  return users.filter((u) => set.has(u.uid));
}

/**
 * Samler de UIDs en spiller må se i stillingen: sig selv + alle medlemmer
 * af de ligaer, spilleren selv er med i. Bruges til at begrænse den
 * "samlede" stilling til ens egne liga-netværk.
 *
 * @param {Array<{memberUids?: string[]}>} leagues  – spillerens egne ligaer
 * @param {string|null|undefined} selfUid           – den indloggede bruger
 * @returns {string[]}  – unikke UIDs (mindst spilleren selv hvis kendt)
 */
export function collectVisibleUids(leagues, selfUid) {
  const set = new Set();
  if (selfUid) set.add(selfUid);
  for (const l of leagues ?? []) {
    for (const uid of l?.memberUids ?? []) set.add(uid);
  }
  return [...set];
}

/**
 * Sorterer brugere faldende efter totalPoints (allerede denormaliseret).
 * Giver en ny array – muterer ikke input.
 *
 * @param {Array<{totalPoints?: number}>} users
 * @returns {Array<{totalPoints?: number}>}
 */
export function sortByPoints(users) {
  return [...users].sort(
    (a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0)
  );
}

/**
 * Antal afsluttede kampe hver spiller har tippet — bruges til "gns. point pr.
 * tippet kamp". Bygger på tipParticipation (matchId → Set(uids)) krydset med de
 * afsluttede kampe, så kun kampe der har givet point tæller med.
 *
 * @param {Array<object>} matches             – alle kampe (skal have .id og .status)
 * @param {Map<string, Set<string>>} byMatch  – matchId → Set(uids) der har tippet
 * @returns {Record<string, number>}          – uid → antal tippede, afsluttede kampe
 */
export function tippedFinishedCounts(matches, byMatch) {
  const counts = {};
  for (const m of matches ?? []) {
    if (!m || m.status !== 'finished') continue;
    const set = byMatch?.get?.(m.id);
    if (!set) continue;
    for (const uid of set) counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
}

/**
 * Beregner point pr. spiller fra dagens afsluttede kampe.
 * Rent klient-baseret: matcher (finished + kickoff i dag) + bets.
 *
 * @param {Array<object>} matches  – alle hentede kampe
 * @param {Array<object>} bets     – alle hentede bets (documentId = uid_matchId)
 * @param {string} todayStr        – 'YYYY-MM-DD'
 * @returns {Record<string, number>}  – uid → point (kun spillere med ≥1 bet)
 */
export function computeDailyPoints(matches, bets, todayStr) {
  // Find id'er på afsluttede kampe med kickoff i dag
  const todayMatchIds = new Set(
    matches
      .filter((m) => {
        if (m.status !== 'finished') return false;
        const kickoff = m.kickoff?.toDate ? m.kickoff.toDate() : new Date(m.kickoff);
        const dateStr = kickoff.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
        return dateStr === todayStr;
      })
      .map((m) => m.id)
  );

  if (todayMatchIds.size === 0) return {};

  // Beregn point pr. uid
  const pointsByUid = {};

  bets.forEach((bet) => {
    if (!todayMatchIds.has(bet.matchId)) return;

    // Find den tilhørende kamp for at få resultat
    const match = matches.find((m) => m.id === bet.matchId);
    if (!match?.result) return;

    // Knockout-kampe scorer anderledes (advance)
    const isKnockout = match.round && match.round !== 'group';
    const pts = isKnockout
      ? scoreKnockout(bet, match.result, match)
      : scoreMatch(bet, match.result);

    pointsByUid[bet.uid] = (pointsByUid[bet.uid] ?? 0) + pts;
  });

  return pointsByUid;
}
