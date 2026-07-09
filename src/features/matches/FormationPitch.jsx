// ---------------------------------------------------------------------------
// FormationPitch – grafisk opstilling på en bane. Bruger FIFA's LineupX/Y-
// koordinater når de findes; ellers udledes rækkerne af formations-strengen
// (fx "4-1-2-3"): målmand nederst, angreb øverst.
// ---------------------------------------------------------------------------

function shortName(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1]; // efternavn/kaldenavn
}

// Del startelveren i rækker ud fra formations-strengen. Antager målmand først.
function rowsFromFormation(lineup, formation) {
  const nums = String(formation || '').split(/[-\s]+/).map((n) => parseInt(n, 10)).filter((n) => n > 0);
  const gk = lineup[0];
  const rest = lineup.slice(1);
  const rows = [];
  let i = 0;
  const counts = nums.length ? nums : [rest.length]; // fallback: alle på én række
  for (const c of counts) {
    rows.push(rest.slice(i, i + c));
    i += c;
  }
  if (i < rest.length) rows.push(rest.slice(i)); // rest-spillere (skæve tal)
  // Øverst = angreb → vend rækkefølgen, og læg målmanden nederst.
  return [...rows.reverse(), gk ? [gk] : []];
}

function PlayerChip({ p }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 44 }}>
      <span style={{
        width: 26, height: 26, borderRadius: '50%', background: 'var(--c-surface, #fff)',
        border: '2px solid var(--c-pitch, #16a34a)', color: 'var(--c-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.72rem', fontWeight: 700,
      }}>{p.shirt ?? ''}</span>
      <span style={{ fontSize: '0.62rem', color: '#fff', textShadow: '0 1px 2px #000', textAlign: 'center', lineHeight: 1.1, maxWidth: 56 }}>
        {shortName(p.name)}{p.captain ? ' (C)' : ''}
      </span>
    </div>
  );
}

export default function FormationPitch({ team, title }) {
  const lineup = team?.lineup;
  if (!Array.isArray(lineup) || lineup.length === 0) return null;

  const rows = rowsFromFormation(lineup, team.formation);

  return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.3rem' }}>
        {title}{team.formation ? ` · ${team.formation}` : ''}
      </div>
      <div style={{
        background: 'linear-gradient(0deg, #2e7d32, #388e3c)', borderRadius: 10,
        padding: '0.6rem 0.3rem', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', gap: '0.5rem', minHeight: 240,
        border: '1px solid rgba(255,255,255,0.25)',
      }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', justifyContent: 'space-around', gap: '0.25rem' }}>
            {row.map((p, pi) => <PlayerChip key={pi} p={p} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
