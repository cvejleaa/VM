// Mapping fra holdkode (FIFA/IOC-stil, som i data/group-stage.json) til
// fuldt dansk landenavn + ISO 3166-1 alpha-2 kode (til rigtige flag via flagcdn).
// ECU2/MEX2 m.fl. er midlertidige pladsholdere indtil alle kvalifikanter kendes.
export const TEAMS = {
  ALB: { name: 'Albanien', iso: 'al' },
  ALG: { name: 'Algeriet', iso: 'dz' },
  ARG: { name: 'Argentina', iso: 'ar' },
  AUS: { name: 'Australien', iso: 'au' },
  BEL: { name: 'Belgien', iso: 'be' },
  BOL: { name: 'Bolivia', iso: 'bo' },
  BRA: { name: 'Brasilien', iso: 'br' },
  CAN: { name: 'Canada', iso: 'ca' },
  CHI: { name: 'Chile', iso: 'cl' },
  CMR: { name: 'Cameroun', iso: 'cm' },
  COL: { name: 'Colombia', iso: 'co' },
  COT: { name: 'Elfenbenskysten', iso: 'ci' },
  CRO: { name: 'Kroatien', iso: 'hr' },
  DEN: { name: 'Danmark', iso: 'dk' },
  ECU: { name: 'Ecuador', iso: 'ec' },
  ECU2: { name: 'Ecuador', iso: 'ec' },
  EGY: { name: 'Egypten', iso: 'eg' },
  ENG: { name: 'England', iso: 'gb-eng' },
  ESP: { name: 'Spanien', iso: 'es' },
  FRA: { name: 'Frankrig', iso: 'fr' },
  GER: { name: 'Tyskland', iso: 'de' },
  GHA: { name: 'Ghana', iso: 'gh' },
  GRE: { name: 'Grækenland', iso: 'gr' },
  IRN: { name: 'Iran', iso: 'ir' },
  ISR: { name: 'Israel', iso: 'il' },
  ITA: { name: 'Italien', iso: 'it' },
  JPN: { name: 'Japan', iso: 'jp' },
  KOR: { name: 'Sydkorea', iso: 'kr' },
  MAR: { name: 'Marokko', iso: 'ma' },
  MEX: { name: 'Mexico', iso: 'mx' },
  MEX2: { name: 'Mexico', iso: 'mx' },
  NED: { name: 'Holland', iso: 'nl' },
  NGA: { name: 'Nigeria', iso: 'ng' },
  PER: { name: 'Peru', iso: 'pe' },
  POL: { name: 'Polen', iso: 'pl' },
  POR: { name: 'Portugal', iso: 'pt' },
  QAT: { name: 'Qatar', iso: 'qa' },
  ROU: { name: 'Rumænien', iso: 'ro' },
  SAU: { name: 'Saudi-Arabien', iso: 'sa' },
  SEN: { name: 'Senegal', iso: 'sn' },
  SLO: { name: 'Slovenien', iso: 'si' },
  SRB: { name: 'Serbien', iso: 'rs' },
  SUI: { name: 'Schweiz', iso: 'ch' },
  SVK: { name: 'Slovakiet', iso: 'sk' },
  TUN: { name: 'Tunesien', iso: 'tn' },
  URU: { name: 'Uruguay', iso: 'uy' },
  USA: { name: 'USA', iso: 'us' },
  VEN: { name: 'Venezuela', iso: 've' },
};

/** Fuldt dansk landenavn for en holdkode (falder tilbage til selve koden). */
export function teamName(code) {
  if (!code) return '';
  return TEAMS[code]?.name ?? code;
}

/** ISO-kode til flag (eller null hvis ukendt). */
export function teamIso(code) {
  return code ? (TEAMS[code]?.iso ?? null) : null;
}

/** flagcdn-URL for en holdkode (eller null). w = bredde i px (20/40/80/160). */
export function flagUrl(code, w = 40) {
  const iso = teamIso(code);
  return iso ? `https://flagcdn.com/w${w}/${iso}.png` : null;
}
