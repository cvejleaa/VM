// Admin: oversigt over hver spillers FORUDSAGTE gruppevinder, udledt af deres
// kamp-tips i grundspillet. Tæller kun spillere der har tippet alle 6 kampe i
// gruppen. Formål: tilskrive point for "rigtigt tippet gruppevinder".
import { useMemo, useState } from 'react';
import { useStatsData } from '../stats/useStatsData';
import { derivedGroupWinners } from './derivedGroupWinners';
import { callAwardDerivedGroupWinners } from './adminActions';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';

function nameOf(usersById, uid) {
  return usersById?.[uid]?.displayName || '(ukendt)';
}

/** Kompakt visning af en spillers 6 kamp-tips. */
function TipsLine({ tips }) {
  if (!tips || tips.length === 0) return null;
  return (
    <div style={{ flexBasis: '100%', fontSize: '0.78rem', color: 'var(--c-muted)', paddingLeft: '1.7rem' }}>
      {tips.map((t, i) => (
        <span key={t.matchId}>
          {i > 0 ? ' · ' : ''}
          {t.homeTeam} <strong style={{ color: 'var(--c-text)' }}>{t.home}–{t.away}</strong> {t.awayTeam}
        </span>
      ))}
    </div>
  );
}

export default function GroupWinnerDerivedTab() {
  const { matches, betsByMatch, usersById, loading } = useStatsData();
  const [onlyCorrect, setOnlyCorrect] = useState(false);
  const [awardBusy, setAwardBusy] = useState(false);
  const [awardMsg, setAwardMsg] = useState('');
  const [preview, setPreview] = useState(null); // dry-run-resultat

  async function runAward(dryRun) {
    if (!dryRun && !window.confirm('Tilskriv gruppevinder-bonus til de kvalificerede spillere? Kun spillere uden eget svar krediteres — eksisterende svar overskrives ikke.')) return;
    setAwardBusy(true); setAwardMsg('');
    const res = await callAwardDerivedGroupWinners(dryRun);
    setAwardBusy(false);
    if (!res.ok) { setAwardMsg(`Fejl: ${res.error}`); setPreview(null); return; }
    setPreview(res.data);
    setAwardMsg(dryRun
      ? `Forhåndsvisning: ${res.data.totalAwarded} spiller(e) ville få point (kun spillere uden eget svar).`
      : `✓ Tilskrev ${res.data.totalAwarded} spiller(e) gruppevinder-bonus. ${res.data.usersUpdated} totaler opdateret.`);
  }

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

      {/* Tilskriv point — kun spillere UDEN eget bonussvar, eksisterende svar overskrives aldrig */}
      <div className="card card--flat" style={{ marginBottom: '1rem', background: 'var(--c-surface-2, #f7f7f7)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Tilskriv gruppevinder-bonus</strong>
          <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)', flexBasis: '100%' }}>
            Krediterer kun spillere der ramte gruppevinderen via deres kamp-tips OG <strong>ikke selv har svaret</strong> på
            bonusspørgsmålet. Eksisterende svar overskrives aldrig. Det afledte svar markeres som “afledt”.
          </span>
          <button className="btn btn--ghost btn--sm" onClick={() => runAward(true)} disabled={awardBusy}>
            {awardBusy ? '…' : '👁️ Forhåndsvis'}
          </button>
          <button className="btn btn--sm" onClick={() => runAward(false)} disabled={awardBusy || !preview || preview.totalAwarded === 0}>
            ✅ Tilskriv point
          </button>
        </div>
        {awardMsg && (
          <div role="alert" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: awardMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>
            {awardMsg}
          </div>
        )}
        {preview?.groups?.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, fontSize: '0.82rem' }}>
            {preview.groups.filter((g) => g.awarded || g.skippedHasAnswer || g.skippedWrong || g.skippedAmbiguous).map((g) => (
              <li key={g.groupName} style={{ padding: '0.15rem 0' }}>
                <strong>Gruppe {g.groupName}</strong> ({teamName(g.facit) || g.facit}):{' '}
                <span style={{ color: 'var(--c-ok)' }}>{g.awarded} tildeles</span>
                {g.skippedHasAnswer ? <span style={{ color: 'var(--c-muted)' }}> · {g.skippedHasAnswer} har eget svar</span> : null}
                {g.skippedWrong ? <span style={{ color: 'var(--c-muted)' }}> · {g.skippedWrong} ramte ikke</span> : null}
                {g.skippedAmbiguous ? <span style={{ color: 'var(--c-muted)' }}> · {g.skippedAmbiguous} uafgjort i toppen</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

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
                    <TipsLine tips={p.tips} />
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
