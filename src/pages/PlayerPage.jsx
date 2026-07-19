// Spiller-side (/spiller/:id): en spillers statistik på tværs af turneringen —
// nøgletal + per-kamp-opdeling, bygget på details.playerStats.
import { useParams, Link } from 'react-router-dom';
import { useMatches } from '../features/matches/useMatches';
import { computePlayerProfile } from '../features/stats/statsUtils';
import { teamName } from '../lib/teams';
import Flag from '../components/Flag';
import TeamLink from '../components/TeamLink';

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 62 }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>{label}</div>
    </div>
  );
}

export default function PlayerPage() {
  const { id } = useParams();
  const { matches, loading } = useMatches();

  if (loading) {
    return <div className="container"><div className="spinner" aria-label="Henter spiller…" /></div>;
  }

  const p = computePlayerProfile(matches, id);

  return (
    <div className="container">
      <Link to="/turnering" className="badge badge--muted" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '0.75rem' }}>
        ← Turnering
      </Link>

      {!p ? (
        <div className="empty-state">
          <div className="empty-state__icon">👤</div>
          <div className="empty-state__title">Ingen statistik fundet for denne spiller</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>
            Spiller-data kommer efter “Gen-hent alle detaljer”.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {p.code && <Flag code={p.code} size={40} />}
            <div>
              <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{p.name || 'Spiller'}</h1>
              {p.code && (
                <TeamLink code={p.code} style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>
                  {teamName(p.code)} · {p.matches} kampe
                </TeamLink>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Stat label="Mål" value={p.goals} />
              <Stat label="Assists" value={p.assists} />
              <Stat label="Skud" value={p.shots} />
              <Stat label="På mål" value={p.onTarget} />
              <Stat label="Træfsik." value={p.accuracy == null ? '–' : `${p.accuracy}%`} />
              <Stat label="Tophast." value={p.topSpeed ? `${p.topSpeed}` : '–'} />
              <Stat label="Løb (km)" value={p.distance || '–'} />
            </div>
          </div>

          <div className="card">
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Per kamp</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ color: 'var(--c-muted)', borderBottom: '1px solid var(--c-border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Mod</th>
                    <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Mål</th>
                    <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Assist</th>
                    <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Skud</th>
                    <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', fontWeight: 600 }}>Tophast.</th>
                  </tr>
                </thead>
                <tbody>
                  {p.perMatch.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '0.3rem 0.4rem' }}>
                        {r.opp ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Flag code={r.opp} size={15} /> {teamName(r.opp)}
                          </span>
                        ) : '–'}
                      </td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.goals || ''}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.assists || ''}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{r.shots || ''}</td>
                      <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{r.topSpeed || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
