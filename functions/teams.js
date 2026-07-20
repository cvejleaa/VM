'use strict';
// Holdkode → dansk landenavn + ISO 3166-1 alpha-2 (til flagcdn-flag i mails).
// Server-side spejl af src/lib/teams.js (holdes i sync manuelt; kun brugt til
// mail-udsendelse, hvor frontend-modulet ikke kan importeres).
const TEAMS = {
  MEX: { name: 'Mexico', iso: 'mx' },
  KOR: { name: 'Sydkorea', iso: 'kr' },
  RSA: { name: 'Sydafrika', iso: 'za' },
  CZE: { name: 'Tjekkiet', iso: 'cz' },
  CAN: { name: 'Canada', iso: 'ca' },
  SUI: { name: 'Schweiz', iso: 'ch' },
  QAT: { name: 'Qatar', iso: 'qa' },
  BIH: { name: 'Bosnien-Hercegovina', iso: 'ba' },
  BRA: { name: 'Brasilien', iso: 'br' },
  MAR: { name: 'Marokko', iso: 'ma' },
  HAI: { name: 'Haiti', iso: 'ht' },
  SCO: { name: 'Skotland', iso: 'gb-sct' },
  USA: { name: 'USA', iso: 'us' },
  PAR: { name: 'Paraguay', iso: 'py' },
  AUS: { name: 'Australien', iso: 'au' },
  TUR: { name: 'Tyrkiet', iso: 'tr' },
  GER: { name: 'Tyskland', iso: 'de' },
  CUW: { name: 'Curaçao', iso: 'cw' },
  CIV: { name: 'Elfenbenskysten', iso: 'ci' },
  ECU: { name: 'Ecuador', iso: 'ec' },
  NED: { name: 'Holland', iso: 'nl' },
  SWE: { name: 'Sverige', iso: 'se' },
  TUN: { name: 'Tunesien', iso: 'tn' },
  JPN: { name: 'Japan', iso: 'jp' },
  BEL: { name: 'Belgien', iso: 'be' },
  EGY: { name: 'Egypten', iso: 'eg' },
  IRN: { name: 'Iran', iso: 'ir' },
  NZL: { name: 'New Zealand', iso: 'nz' },
  ESP: { name: 'Spanien', iso: 'es' },
  CPV: { name: 'Kap Verde', iso: 'cv' },
  KSA: { name: 'Saudi-Arabien', iso: 'sa' },
  URU: { name: 'Uruguay', iso: 'uy' },
  FRA: { name: 'Frankrig', iso: 'fr' },
  SEN: { name: 'Senegal', iso: 'sn' },
  IRQ: { name: 'Irak', iso: 'iq' },
  NOR: { name: 'Norge', iso: 'no' },
  ARG: { name: 'Argentina', iso: 'ar' },
  ALG: { name: 'Algeriet', iso: 'dz' },
  AUT: { name: 'Østrig', iso: 'at' },
  JOR: { name: 'Jordan', iso: 'jo' },
  POR: { name: 'Portugal', iso: 'pt' },
  COD: { name: 'DR Congo', iso: 'cd' },
  UZB: { name: 'Usbekistan', iso: 'uz' },
  COL: { name: 'Colombia', iso: 'co' },
  ENG: { name: 'England', iso: 'gb-eng' },
  CRO: { name: 'Kroatien', iso: 'hr' },
  GHA: { name: 'Ghana', iso: 'gh' },
  PAN: { name: 'Panama', iso: 'pa' },
};

/** Fuldt dansk landenavn for en holdkode (falder tilbage til selve koden). */
function teamName(code) {
  if (!code) return '';
  return (TEAMS[code] && TEAMS[code].name) || code;
}

/** flagcdn-URL for en holdkode (eller null hvis ukendt). w = 20/40/80/160. */
function flagUrl(code, w = 40) {
  const iso = code && TEAMS[code] ? TEAMS[code].iso : null;
  return iso ? `https://flagcdn.com/w${w}/${iso}.png` : null;
}

module.exports = { TEAMS, teamName, flagUrl };
