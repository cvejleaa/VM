// 🎯 Skudkort: plotter skud (Type 12) og mål (Type 0/41/34) på en bane ud fra
// tidslinjens bane-koordinater (details.events x/y). FIFA's koordinat er ABSOLUT
// (holdene skifter banehalvdel ved pausen), så vi normaliserer pr. periode, så
// hjemmeholdet altid angriber opad — ellers ville et holds skud ligge i begge ender.

const GOAL_TYPES = new Set([0, 41, 34]);
const SHOT_TYPES = new Set([0, 41, 34, 12]);

/**
 * Normalisér skud/mål til én retning (hjemme angriber høj X = opad). Ren funktion.
 * @param {Array<object>} events  details.events
 * @returns {Array<{side, x, y, isGoal, player, minute, injuryTime}>}
 */
export function buildShotPoints(events) {
  const evs = (Array.isArray(events) ? events : [])
    .filter((e) => e && e.x != null && e.y != null && SHOT_TYPES.has(e.type));
  const byPeriod = {};
  for (const e of evs) (byPeriod[e.period] ||= []).push(e);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const flipOf = {};
  for (const [p, list] of Object.entries(byPeriod)) {
    const homeX = list.filter((e) => e.side === 'home').map((e) => e.x);
    const awayX = list.filter((e) => e.side === 'away').map((e) => e.x);
    // Hjemme skal angribe høj X. Flip perioden hvis hjemmes skud i snit ligger lavt
    // (eller, mangler hjemme-skud, hvis udes skud ligger højt).
    flipOf[p] = homeX.length ? avg(homeX) < 50 : (awayX.length ? avg(awayX) > 50 : false);
  }
  return evs.map((e) => {
    const f = flipOf[e.period];
    return {
      side: e.side,
      x: f ? 100 - e.x : e.x,
      y: f ? 100 - e.y : e.y,
      isGoal: GOAL_TYPES.has(e.type),
      player: e.player || null,
      minute: e.minute, injuryTime: e.injuryTime,
    };
  });
}

// Lodret bane (68×105) tegnet i SVG-brugerenheder.
function Pitch() {
  const s = { fill: 'none', stroke: 'var(--c-border, #cfd8cf)', strokeWidth: 0.5 };
  return (
    <g>
      <rect x="0" y="0" width="68" height="105" fill="var(--c-pitch-bg, rgba(22,163,74,0.06))" stroke="var(--c-border,#cfd8cf)" strokeWidth="0.6" />
      <line x1="0" y1="52.5" x2="68" y2="52.5" style={s} />
      <circle cx="34" cy="52.5" r="9.15" style={s} />
      <circle cx="34" cy="52.5" r="0.6" fill="var(--c-border,#cfd8cf)" />
      {/* Straffefelter (40.32 bredt × 16.5 dybt) */}
      <rect x="13.84" y="0" width="40.32" height="16.5" style={s} />
      <rect x="13.84" y="88.5" width="40.32" height="16.5" style={s} />
      {/* Målfelter */}
      <rect x="24.84" y="0" width="18.32" height="5.5" style={s} />
      <rect x="24.84" y="99.5" width="18.32" height="5.5" style={s} />
    </g>
  );
}

export default function ShotMap({ events, homeName, awayName }) {
  const pts = buildShotPoints(events);
  if (pts.length === 0) return null;
  const homeGoals = pts.filter((p) => p.side === 'home' && p.isGoal).length;
  const awayGoals = pts.filter((p) => p.side === 'away' && p.isGoal).length;
  const homeShots = pts.filter((p) => p.side === 'home').length;
  const awayShots = pts.filter((p) => p.side === 'away').length;

  const marker = (p, i) => {
    const cx = (p.y / 100) * 68;
    const cy = (1 - p.x / 100) * 105; // høj X (hjemmes angreb) → top
    const color = p.side === 'home' ? 'var(--c-pitch, #16a34a)' : '#8a8f88';
    if (p.isGoal) {
      return <circle key={i} cx={cx} cy={cy} r="2.1" fill={color} stroke="#fff" strokeWidth="0.7">
        <title>{`Mål${p.player ? ` · ${p.player}` : ''}${p.minute != null ? ` · ${p.minute}'` : ''}`}</title>
      </circle>;
    }
    return <circle key={i} cx={cx} cy={cy} r="1.1" fill={color} fillOpacity="0.5">
      <title>{`Skud${p.player ? ` · ${p.player}` : ''}${p.minute != null ? ` · ${p.minute}'` : ''}`}</title>
    </circle>;
  };

  return (
    <div style={{ marginTop: '0.3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--c-muted)', marginBottom: '0.25rem' }}>
        <span>▲ {homeName} · {homeShots} skud / {homeGoals} mål</span>
      </div>
      <div style={{ maxWidth: 300, margin: '0 auto' }}>
        <svg viewBox="-2 -2 72 109" width="100%" role="img" aria-label="Skudkort">
          <Pitch />
          {pts.map(marker)}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--c-muted)', marginTop: '0.25rem' }}>
        <span>▼ {awayName} · {awayShots} skud / {awayGoals} mål</span>
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--c-muted)', textAlign: 'center', marginTop: '0.2rem' }}>
        Store cirkler = mål · små = skud. Normaliseret så hvert hold angriber sin egen ende.
      </div>
    </div>
  );
}
