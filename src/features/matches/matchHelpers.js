// ---------------------------------------------------------------------------
// Rene hjælpefunktioner til kamp-logik. Ingen Firebase-afhængigheder.
// Kan testes uden netværk.
// ---------------------------------------------------------------------------
import { TIMEZONE } from '../../lib/constants';

/**
 * Afgør om en kamp er låst (nu >= kickoff).
 * @param {Date|number|{toDate:()=>Date}|null} kickoff  Firestore Timestamp, Date eller ms
 * @param {Date} [now]  Injiceret tidspunkt til test (default: new Date())
 * @returns {boolean}
 */
export function isMatchLocked(kickoff, now = new Date()) {
  if (!kickoff) return false;
  const ko =
    typeof kickoff.toDate === 'function'
      ? kickoff.toDate()
      : new Date(kickoff);
  return now >= ko;
}

/**
 * Afgør om en kamp faktisk kan tippes lige nu:
 *  - holdene skal være kendt (ikke en knockout der venter på hold)
 *  - status må ikke være 'pendingTeams'
 *  - kampen må ikke være låst (kickoff passeret)
 * @param {object} match
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isTippable(match, now = new Date()) {
  if (!match) return false;
  if (!match.homeTeam || !match.awayTeam) return false;
  if (match.status === 'pendingTeams') return false;
  return !isMatchLocked(match.kickoff, now);
}

/**
 * Formaterer en dato til dansk dagsnøgle, fx "onsdag 11. juni".
 * Bruges som grupperings-nøgle (og vises som overskrift).
 * @param {Date|{toDate:()=>Date}|null} kickoff
 * @returns {string}
 */
export function dayKey(kickoff) {
  if (!kickoff) return 'Ukendt dato';
  const d =
    typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

/**
 * Grupperer en liste af kampe (med .kickoff) efter dansk dagsnøgle.
 * Returnerer array af { label: string, matches: Match[] } – sorteret efter dag.
 * @param {Array} matches
 * @returns {Array<{label:string, matches:Array}>}
 */
export function groupMatchesByDay(matches) {
  const map = new Map();
  for (const m of matches) {
    const key = dayKey(m.kickoff);
    if (!map.has(key)) map.set(key, { label: key, matches: [], _ts: m.kickoff });
    map.get(key).matches.push(m);
  }
  // Sorter dagene kronologisk (brug første kamps kickoff)
  return [...map.values()].sort((a, b) => {
    const ta = typeof a._ts?.toDate === 'function' ? a._ts.toDate() : new Date(a._ts ?? 0);
    const tb = typeof b._ts?.toDate === 'function' ? b._ts.toDate() : new Date(b._ts ?? 0);
    return ta - tb;
  });
}

/**
 * Formaterer kickoff-tidspunkt til "HH:mm" (Copenhagen-tid).
 * @param {*} kickoff
 * @returns {string}
 */
export function formatKickoffTime(kickoff) {
  if (!kickoff) return '--:--';
  const d =
    typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Formaterer kickoff-dato kompakt til "11. jun" (Copenhagen-tid).
 * @param {*} kickoff
 * @returns {string}
 */
export function formatKickoffDate(kickoff) {
  if (!kickoff) return '';
  const d =
    typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(d);
}

/**
 * Returnerer rundens fulde danske navn.
 * @param {string} round
 * @returns {string}
 */
export function roundLabel(round) {
  const map = {
    group: 'Gruppespil',
    r32: '1/16-finale',
    r16: '1/8-finale',
    qf: 'Kvartfinale',
    sf: 'Semifinale',
    bronze: 'Bronzekamp',
    final: 'Finale',
  };
  return map[round] ?? round;
}

/**
 * Flag-emoji for en landekode (ISO 3166-1 alpha-2).
 * Virker i moderne browsere og iOS.
 * @param {string|null} code
 * @returns {string}
 */
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '🏳️';
  return (
    String.fromCodePoint(
      ...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
    )
  );
}

/**
 * Live-label til kamp-headeren, fx "1. halvleg · 43'" eller "2. halvleg · 67+2'".
 * Bygger på det synkede spilleminut (match.details.minute/injuryTime). Mangler
 * minuttet, returneres bare "LIVE".
 * @param {object} match
 * @returns {string}
 */
export function liveMinuteLabel(match) {
  const d = match?.details || {};
  const m = d.minute;
  if (m == null) return 'LIVE';
  const half = m <= 45 ? '1. halvleg' : m <= 90 ? '2. halvleg' : 'Forlænget tid';
  const it = d.injuryTime;
  const minuteStr = `${m}${it ? `+${it}` : ''}'`;
  return `${half} · ${minuteStr}`;
}
