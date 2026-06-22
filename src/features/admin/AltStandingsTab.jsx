// Admin-only: alternativ stilling baseret på antal mål pr. hold.
//   Rigtigt holdtal → +antal (rigtigt 0 = +2); forkert → − |tip − faktisk|.
import { useMemo } from 'react';
import { useStatsData } from '../stats/useStatsData';
import { computeAltStandings } from '../stats/altStandings';

export default function AltStandingsTab() {
  const { matches, betsByMatch, usersById, loading, error } = useStatsData();
  const rows = useMemo(
    () => computeAltStandings(matches, betsByMatch, usersById),
    [matches, betsByMatch, usersById],
  );

  return (
    <div>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>🧮 Alternativ stilling (måltips)</h2>
      <p style={{ margin: '0 0 0.9rem', fontSize: '0.85rem', color: 'var(--c-muted)' }}>
        Pr. hold: rammer du holdets antal mål præcist, får du <strong>+antal mål</strong> (et rigtigt 0 giver +2);
        rammer du forkert, får du <strong>− forskellen</strong> (|tip − faktisk|). Summeret over alle afsluttede
        kampe. (Kun synlig for admin indtil videre.)
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? (
        <div className="spinner" role="status" aria-label="Henter" />
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen afgjorte kampe med tips endnu.</p>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th style={{ width: '2rem' }}>#</th>
                <th>Spiller</th>
                <th className="text-center">Kampe</th>
                <th className="text-center">⌀/kamp</th>
                <th className="text-center" style={{ color: 'var(--c-pitch)' }}>Point</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.uid} data-testid="alt-standings-row">
                  <td className="text-muted">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="text-center text-muted">{r.matches}</td>
                  <td className="text-center text-muted">{r.avg}</td>
                  <td className="text-center">
                    <strong style={{ color: r.points < 0 ? 'var(--c-err)' : 'var(--c-text)' }}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
