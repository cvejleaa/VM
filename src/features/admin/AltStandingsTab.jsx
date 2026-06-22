// Admin-only: sammenligning af to mål-baserede point-regnskaber.
//   "Hård" (nuværende): rigtigt 0 = +2, rigtigt N = +N, forkert = −forskel.
//   "🎯 Skarpskytten": rigtigt N = +(N+1), forkert = −min(forskel,2), +1 for udfald.
//   Begge: utippet kamp = −2. Summeret over alle afsluttede kampe.
import { useMemo, useState } from 'react';
import { useStatsData } from '../stats/useStatsData';
import { computeComparison } from '../stats/altStandings';

function Pts({ value }) {
  return (
    <strong style={{ color: value < 0 ? 'var(--c-err)' : 'var(--c-text)' }}>
      {value > 0 ? `+${value}` : value}
    </strong>
  );
}

export default function AltStandingsTab() {
  const { matches, betsByMatch, usersById, loading, error } = useStatsData();
  const [sortBy, setSortBy] = useState('sharp'); // 'hard' | 'sharp'

  const players = useMemo(
    () => Object.values(usersById || {})
      .filter((u) => u.status === 'approved')
      .map((u) => ({ uid: u.id, name: u.displayName || 'Spiller' })),
    [usersById],
  );
  const rows = useMemo(() => {
    const r = computeComparison(matches, betsByMatch, players);
    return [...r].sort((a, b) => b[sortBy] - a[sortBy] || a.name.localeCompare(b.name, 'da'));
  }, [matches, betsByMatch, players, sortBy]);

  return (
    <div>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>🧮 Måltips-stillinger (sammenligning)</h2>
      <div style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: 'var(--c-muted)', lineHeight: 1.5 }}>
        <div><strong>Hård</strong> (nuværende): rigtigt holdtal = +antal mål (rigtigt 0 = +2); forkert = − forskellen.</div>
        <div><strong>🎯 Skarpskytten</strong>: rigtigt holdtal = +(antal+1) (rigtigt 0 = +1); forkert = − forskellen, men <strong>højst −2 pr. hold</strong>; <strong>+1</strong> hvis du rammer kampens udfald.</div>
        <div>I begge: en kamp du <strong>ikke har tippet</strong> = <strong>−2</strong>. Summeret over alle afsluttede kampe. (Kun admin.)</div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? (
        <div className="spinner" role="status" aria-label="Henter" />
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen afgjorte kampe med tips endnu.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--c-muted)' }}>Sortér efter:</span>
            <button
              className={`btn btn--sm${sortBy === 'hard' ? '' : ' btn--ghost'}`}
              onClick={() => setSortBy('hard')}
            >
              Hård
            </button>
            <button
              className={`btn btn--sm${sortBy === 'sharp' ? '' : ' btn--ghost'}`}
              onClick={() => setSortBy('sharp')}
            >
              🎯 Skarpskytten
            </button>
          </div>

          <div className="table-wrap">
            <table className="table" style={{ fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '2rem' }}>#</th>
                  <th>Spiller</th>
                  <th className="text-center">Tippet</th>
                  <th className="text-center">Hård</th>
                  <th className="text-center" style={{ color: 'var(--c-pitch)' }}>🎯 Skarp</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.uid} data-testid="alt-standings-row">
                    <td className="text-muted">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="text-center text-muted">
                      {r.tipped}/{r.matches}
                      {r.untipped > 0 && <span style={{ color: 'var(--c-err)' }}> (−{r.untipped * 2})</span>}
                    </td>
                    <td className="text-center"><Pts value={r.hard} /></td>
                    <td className="text-center"><Pts value={r.sharp} /></td>
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
