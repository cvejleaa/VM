// Admin: oversigt over hver spillers FORUDSAGTE gruppevinder, udledt af deres
// kamp-tips i grundspillet. Tæller kun spillere der har tippet alle 6 kampe i
// gruppen. Formål: tilskrive point for "rigtigt tippet gruppevinder".
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { useStatsData } from '../stats/useStatsData';
import { useBonusQuestions } from './useBonusQuestions';
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
  const { questions } = useBonusQuestions();
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'correct' | 'eligible'
  const [awardBusy, setAwardBusy] = useState(false);
  const [awardMsg, setAwardMsg] = useState('');
  const [preview, setPreview] = useState(null);

  // groupWinner-spørgsmål pr. gruppe (for at finde hvem der selv har svaret).
  const gwQuestionByGroup = useMemo(() => {
    const m = new Map();
    for (const q of questions) {
      if (q.type === 'groupWinner' && q.groupName) m.set(q.groupName, q);
    }
    return m;
  }, [questions]);

  // Hvem har selv svaret (uid → answer) pr. gruppe — admin kan læse alle bonusBets.
  const [answersByGroup, setAnswersByGroup] = useState(new Map());
  useEffect(() => {
    const entries = [...gwQuestionByGroup.entries()];
    const ids = entries.map(([, q]) => q.id);
    if (ids.length === 0) { setAnswersByGroup(new Map()); return undefined; }
    const qidToGroup = new Map(entries.map(([g, q]) => [q.id, g]));
    // Firestore 'in' op til 30 — en VM har 12 grupper, så ét kald er nok.
    const unsub = onSnapshot(
      query(collection(db, COL.BONUS_BETS), where('questionId', 'in', ids.slice(0, 30))),
      (snap) => {
        const m = new Map();
        snap.docs.forEach((d) => {
          const b = d.data();
          const g = qidToGroup.get(b.questionId);
          if (!g) return;
          if (!m.has(g)) m.set(g, new Map());
          m.get(g).set(b.uid, b.answer);
        });
        setAnswersByGroup(m);
      },
      (err) => console.error('groupWinner-svar:', err),
    );
    return unsub;
  }, [gwQuestionByGroup]);

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

  // Berig hver forudsigelse med eget-svar-status + "tildeles point" (eligible).
  const enriched = useMemo(() => groups.map((g) => {
    const answered = answersByGroup.get(g.groupName) || new Map();
    const predictions = g.predictions.map((p) => {
      const ownAnswer = answered.get(p.uid) ?? null;
      const hasOwn = answered.has(p.uid);
      const eligible = !!p.correct && !p.ambiguous && !hasOwn;
      return { ...p, ownAnswer, hasOwn, eligible };
    });
    return { ...g, predictions };
  }), [groups, answersByGroup]);

  const totals = useMemo(() => {
    let correct = 0; let eligible = 0;
    for (const g of enriched) for (const p of g.predictions) { if (p.correct) correct += 1; if (p.eligible) eligible += 1; }
    return { correct, eligible };
  }, [enriched]);

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
        (kun spillere der har tippet <strong>alle 6 kampe</strong> i gruppen). 💰 = får point ved tildeling
        (ramte vinderen og har ikke selv svaret). ✓ = ramte vinderen.
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--c-muted)' }}>Vis:</span>
        <button className={`btn btn--sm${filterMode === 'all' ? '' : ' btn--ghost'}`} onClick={() => setFilterMode('all')}>Alle</button>
        <button className={`btn btn--sm${filterMode === 'correct' ? '' : ' btn--ghost'}`} onClick={() => setFilterMode('correct')}>Kun korrekte ({totals.correct})</button>
        <button className={`btn btn--sm${filterMode === 'eligible' ? '' : ' btn--ghost'}`} onClick={() => setFilterMode('eligible')}>💰 Kun dem der tildeles ({totals.eligible})</button>
      </div>

      {/* Tilskriv point — kun spillere UDEN eget bonussvar, eksisterende svar overskrives aldrig */}
      <div className="card card--flat" style={{ marginBottom: '1rem', background: 'var(--c-surface-2, #f7f7f7)' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Tilskriv gruppevinder-bonus</strong>
          <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)', flexBasis: '100%' }}>
            Krediterer kun spillere der ramte gruppevinderen via deres kamp-tips OG <strong>ikke selv har svaret</strong> på
            bonusspørgsmålet (markeret 💰 nedenfor). Eksisterende svar overskrives aldrig.
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
      </div>

      {enriched.map((g) => {
        const preds = [...g.predictions].sort((a, b) => {
          if (a.eligible !== b.eligible) return a.eligible ? -1 : 1; // tildeles først
          if (!!b.correct !== !!a.correct) return (b.correct ? 1 : 0) - (a.correct ? 1 : 0);
          return nameOf(usersById, a.uid).localeCompare(nameOf(usersById, b.uid), 'da');
        });
        const shown = preds.filter((p) => (
          filterMode === 'correct' ? p.correct : filterMode === 'eligible' ? p.eligible : true
        ));
        const correctCount = preds.filter((p) => p.correct).length;
        const eligibleCount = preds.filter((p) => p.eligible).length;

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
              <span className="badge badge--blue" style={{ marginLeft: 'auto' }}>{correctCount}/{preds.length} ramte</span>
              {g.actualWinner && <span className="badge badge--green" title="Får point ved tildeling">💰 {eligibleCount} tildeles</span>}
            </div>

            {shown.length === 0 ? (
              <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                {preds.length === 0 ? 'Ingen spillere har tippet alle 6 kampe i gruppen.' : 'Ingen i dette filter.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0 }}>
                {shown.map((p) => (
                  <li
                    key={p.uid}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      padding: '0.35rem 0', borderTop: '1px solid var(--c-border)', fontSize: '0.9rem',
                      background: p.eligible ? 'rgba(22,163,74,0.06)' : undefined,
                    }}
                  >
                    <span style={{ width: '1.4rem', textAlign: 'center' }}>
                      {p.eligible ? '💰' : p.correct ? '✅' : g.actualWinner ? '❌' : '—'}
                    </span>
                    <strong style={{ minWidth: '8rem' }}>{nameOf(usersById, p.uid)}</strong>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--c-muted)' }}>
                      forudsiger:
                      {p.winner ? <Flag code={p.winner} size={16} /> : null}
                      <strong style={{ color: 'var(--c-text)' }}>{teamName(p.winner) || p.winner || '?'}</strong>
                    </span>
                    {p.hasOwn ? (
                      <span className="badge badge--muted" title="Spilleren har selv svaret på bonusspørgsmålet — krediteres ikke automatisk">
                        eget svar: {teamName(p.ownAnswer) || p.ownAnswer}
                      </span>
                    ) : (
                      <span className="badge badge--blue" title="Spilleren har ikke selv svaret på bonusspørgsmålet">intet eget svar</span>
                    )}
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
