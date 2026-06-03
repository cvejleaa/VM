/**
 * Rene hjælpefunktioner til rangeringsberegninger.
 * Ingen Firebase-afhængigheder – nemme at teste isoleret.
 */

import { TIMEZONE } from '../../lib/constants';
import { scoreMatch, scoreKnockout } from '../../lib/scoring';

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
      ? scoreKnockout(bet, match.result)
      : scoreMatch(bet, match.result);

    pointsByUid[bet.uid] = (pointsByUid[bet.uid] ?? 0) + pts;
  });

  return pointsByUid;
}
