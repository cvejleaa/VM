// Admin: oversigt over hver spillers FORUDSAGTE gruppevinder, udledt af deres
// kamp-tips i grundspillet. Tæller kun spillere der har tippet alle 6 kampe i
// gruppen. Formål: tilskrive point for "rigtigt tippet gruppevinder".
import { useMemo, useState } from 'react';
import { useStatsData } from '../stats/useStatsData';
import { derivedGroupWinners } from './derivedGroupWinners';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';

function nameOf(usersById, uid) {
  return usersById?.[uid]?.displayName || '(ukendt)';
}

export default function GroupWinnerDerivedTab() {
  const { matches, betsByMatch, usersById, loading } = useStatsData();
  const [onlyCorrect, setOnlyCorrect] = useState(false);

  const groups = useMemo(
    () => derivedGroupWinners(matches, betsByMatch),
    [matches, betsByMatch],
  );

  // Samlet: hvor mange forudsagde hver gruppes vinder korrekt.
  const totalCorrect = useMemo(
    () => groups.reduce((s, g) => s + g.predictions.filter((p) => p.correct).length, 0),
    [groups],
  );

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">Ingen færdigspillede grupper endnu.</div>
        <div className="empty-state__sub" style={{ color: 'var(--c-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Forudsagte gruppevindere vises, når en gruppe har alle 6 kampe i basen.
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem', marginTop: 0 }}>
        Hver spillers <strong>forudsagte gruppevinder</strong> er udledt af deres egne kamp-tips
        (kun spillere der har tippet <strong>alle 6 kampe</strong> i gruppen). Brug listen til at
        tilskrive point for rigtigt tippet gruppevinder. ✓ = ramte den faktiske vinder.
      </p>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        <input type="checkbox" checked={onlyCorrect} onChange={(e) => setOnlyCorrect(e.target.checked)} />
        Vis kun korrekte forudsigelser ({totalCorrect})
      </label>

      {groups.map((g) => {
        const preds = [...g.predictions].sort((a, b) => {
          // korrekte først, derefter navn
          if (!!b.correct !== !!a.correct) return (b.correct ? 1 : 0) - (a.correct ? 1 : 0);
          return nameOf(usersById, a.uid).localeCompare(nameOf(usersById, b.uid), 'da');
        });
        const shown = onlyCorrect ? preds.filter((p) => p.correct) : preds;
        const correctCount = preds.filter((p) => p.correct).length;

        return (
          <div key={g.groupName} className="card card--flat" style={{ marginBottom: '1rem' }}>
            <div className="card__header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 className="card__title" style={{ margin: 0 }}>Gruppe {g.groupName}</h3>
              {g.actualWinner ? (
                <span className="badge badge--green" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Flag code={g.actualWinner} size={16} /> Vinder: {teamName(g.actualWinner) || g.actualWinner}
                </span>
              ) : (
                <span className="badge badge--muted">Ikke færdigspillet endnu</span>
              )}
              <span className="badge badge--blue" style={{ marginLeft: 'auto' }}>
                {correctCount}/{preds.length} ramte
              </span>
            </div>

            {shown.length === 0 ? (
              <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                {preds.length === 0 ? 'Ingen spillere har tippet alle 6 kampe i gruppen.' : 'Ingen korrekte forudsigelser.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
                {shown.map((p) => (
                  <li
                    key={p.uid}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      padding: '0.35rem 0', borderTop: '1px solid var(--c-border)', fontSize: '0.9rem',
                    }}
                  >
                    <span style={{ width: '1.2rem', textAlign: 'center' }}>
                      {p.correct ? '✅' : g.actualWinner ? '❌' : '—'}
                    </span>
                    <strong style={{ minWidth: '8rem' }}>{nameOf(usersById, p.uid)}</strong>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--c-muted)' }}>
                      forudsiger:
                      {p.winner ? <Flag code={p.winner} size={16} /> : null}
                      <strong style={{ color: 'var(--c-text)' }}>{teamName(p.winner) || p.winner || '?'}</strong>
                    </span>
                    {p.ambiguous && (
                      <span className="badge badge--yellow" title="Spillerens tips giver uafgjort i toppen — vinderen er valgt alfabetisk">
                        uafgjort i toppen
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
