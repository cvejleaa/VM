// Holdets samlede statistik på hold-siden: mål for/imod, straffe, selvmål, kort,
// xG-diff + holdets spillere (mål/assists/skud). Bygger på de afsluttede kampe.
import { computeCountryStats, computeXgOverUnder, computeTeamPlayers } from './statsUtils';

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ fontSize: '1.2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>{label}</div>
    </div>
  );
}

export default function TeamStatsCard({ matches, code }) {
  const row = computeCountryStats(matches).list.find((r) => r.code === code);
  const xg = computeXgOverUnder(matches).find((r) => r.code === code);
  const players = computeTeamPlayers(matches, code);
  if (!row && !xg && players.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.05rem' }}>📊 Statistik</h2>
      {row && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: players.length ? '0.9rem' : 0 }}>
          <Stat label="Mål for" value={row.goalsFor} />
          <Stat label="Mål imod" value={row.goalsAgainst} />
          <Stat label="Straffemål" value={row.penaltyFor} />
          <Stat label="Selvmål ▲" value={row.ownFor} />
          <Stat label="Selvmål ▼" value={row.ownAgainst} />
          <Stat label="🟨" value={row.yellow} />
          <Stat label="🟥" value={row.red} />
          {xg && <Stat label="xG-diff" value={`${xg.diff > 0 ? '+' : ''}${xg.diff.toFixed(1)}`} />}
        </div>
      )}

      {players.length > 0 && (
        <>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, margin: '0.3rem 0 0.3rem' }}>Spillere</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--c-muted)', borderBottom: '1px solid var(--c-border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Spiller</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Mål</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Assist</th>
                  <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Skud</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '0.3rem 0.4rem', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.goals || ''}</td>
                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.assists || ''}</td>
                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{p.shots || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
