// ---------------------------------------------------------------------------
// venues.js — VM 2026-stadioner → by.
//
// football-data leverer kun stadionets NAVN (feltet `venue`), ikke byen — `area`
// er blot værtsområdet ("World"). Vi slår derfor byen op her. Der er 16 stadioner
// i tre værtsnationer (USA, Mexico, Canada).
//
// Nøglerne matches TOLERANT: vi normaliserer (små bogstaver, accenter væk) og
// tjekker om stadionnavnet fra API'et INDEHOLDER en kendt nøgle. Så små
// navnevarianter ("Azteca" vs "Estadio Azteca", "MetLife" vs "MetLife Stadium")
// rammer stadig. Ukendt stadion → ingen by (vi viser bare navnet).
// ---------------------------------------------------------------------------

// { keys: distinkte del-strenge der identificerer stadionet, city: byen }
const VENUE_CITIES = [
  // USA
  { keys: ['metlife'],          city: 'New York/New Jersey' },
  { keys: ['sofi'],             city: 'Los Angeles' },
  { keys: ['at&t', 'att stadium'], city: 'Dallas' },
  { keys: ['nrg'],              city: 'Houston' },
  { keys: ['gillette'],         city: 'Boston' },
  { keys: ['hard rock'],        city: 'Miami' },
  { keys: ['mercedes-benz', 'mercedes benz'], city: 'Atlanta' },
  { keys: ['lincoln financial'], city: 'Philadelphia' },
  { keys: ["levi's", 'levis'],  city: 'San Francisco Bay Area' },
  { keys: ['arrowhead'],        city: 'Kansas City' },
  { keys: ['lumen'],            city: 'Seattle' },
  // Mexico
  { keys: ['azteca', 'azteka'], city: 'Mexico City' },
  { keys: ['akron'],            city: 'Guadalajara' },
  { keys: ['bbva'],             city: 'Monterrey' },
  // Canada
  { keys: ['bmo'],              city: 'Toronto' },
  { keys: ['bc place'],         city: 'Vancouver' },
];

/** Normalisér til tolerant sammenligning: små bogstaver, accenter væk, trimmet. */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Slå byen op for et stadionnavn fra football-data.
 * @param {string|null|undefined} venue  stadionnavn (fx "MetLife Stadium")
 * @returns {string|null}  byen, eller null hvis stadionet ikke kendes
 */
export function venueCity(venue) {
  if (!venue) return null;
  const n = norm(venue);
  if (!n) return null;
  for (const v of VENUE_CITIES) {
    if (v.keys.some((key) => n.includes(norm(key)))) return v.city;
  }
  return null;
}

/**
 * Visningsklar streng: "Stadion, By" når byen kendes, ellers bare "Stadion".
 * @param {string|null|undefined} venue
 * @returns {string|null}  null hvis der intet stadion er
 */
export function venueLabel(venue) {
  if (!venue) return null;
  const city = venueCity(venue);
  return city ? `${venue}, ${city}` : venue;
}
