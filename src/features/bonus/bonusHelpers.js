// ---------------------------------------------------------------------------
// Rene hjælpefunktioner til bonus-logik. Ingen Firebase-afhængigheder.
// ---------------------------------------------------------------------------
import { TIMEZONE } from '../../lib/constants';

/**
 * Afgør om et bonusspørgsmål er låst (nu >= deadline).
 * @param {Date|number|{toDate:()=>Date}|null} deadline
 * @param {Date} [now]  Injiceret tidspunkt til test (default: new Date())
 * @returns {boolean}
 */
export function isBonusLocked(deadline, now = new Date()) {
  if (!deadline) return false;
  const dl =
    typeof deadline.toDate === 'function' ? deadline.toDate() : new Date(deadline);
  return now >= dl;
}

/**
 * Formaterer en Firestore-deadline til læsbar dansk dato+tid.
 * @param {*} deadline
 * @returns {string}
 */
export function formatDeadline(deadline) {
  if (!deadline) return 'Ukendt';
  const d =
    typeof deadline.toDate === 'function' ? deadline.toDate() : new Date(deadline);
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
