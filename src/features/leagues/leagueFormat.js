/**
 * Liga-formater: hvilke point tæller i en ligas stilling.
 * Point-fordelingen (group/knockout/bonus) beregnes server-side og gemmes på
 * hver brugers dokument.
 */
import { LEAGUE_FORMAT } from '../../lib/constants';

export const FORMAT_OPTIONS = [
  { value: LEAGUE_FORMAT.FULL,            label: 'Fuld (alt tæller)',        desc: 'Alle kampe og bonus tæller — standard.' },
  { value: LEAGUE_FORMAT.BONUS_ONLY,      label: 'Kun bonus',                desc: 'Kun bonus-spørgsmål (gruppevindere + topscorer).' },
  { value: LEAGUE_FORMAT.KNOCKOUT_ONLY,   label: 'Kun slutspil',             desc: 'Kun knockout-kampene tæller.' },
  { value: LEAGUE_FORMAT.GROUP_ONLY,      label: 'Kun grundspil',            desc: 'Kun gruppekampene tæller.' },
  { value: LEAGUE_FORMAT.DOUBLE_KNOCKOUT, label: 'Dobbelt i slutspil',       desc: 'Alt tæller, men slutspil vægtes dobbelt.' },
];

const LABEL = Object.fromEntries(FORMAT_OPTIONS.map((o) => [o.value, o.label]));

export function formatLabel(format) {
  return LABEL[format] || LABEL[LEAGUE_FORMAT.FULL];
}

/**
 * Beregn en spillers point i en given liga ud fra dens format.
 * @param {object} user  – med totalPoints/groupPoints/knockoutPoints/bonusPoints
 * @param {string} format
 * @returns {number}
 */
export function leagueScore(user, format) {
  const total = user?.totalPoints ?? 0;
  const group = user?.groupPoints ?? 0;
  const knockout = user?.knockoutPoints ?? 0;
  const bonus = user?.bonusPoints ?? 0;
  switch (format) {
    case LEAGUE_FORMAT.BONUS_ONLY:      return bonus;
    case LEAGUE_FORMAT.KNOCKOUT_ONLY:   return knockout;
    case LEAGUE_FORMAT.GROUP_ONLY:      return group;
    case LEAGUE_FORMAT.DOUBLE_KNOCKOUT: return group + bonus + knockout * 2;
    case LEAGUE_FORMAT.FULL:
    default:                            return total;
  }
}
