// Forhåndsvisning / kontrolside — henter LIVE data fra en valgfri turnering
// (default Bundesliga 2025/26) og viser præcis hvordan topscorere, stilling og
// kampdetaljer kommer til at se ud under VM. Henter intet ind i basen.
import { useState } from 'react';
import { callPreviewFootballData, callPreviewFifaData, callPreviewFifaScoring } from './adminActions';
import { TopScorersList } from '../stats/TopScorersCard';
import StandingsTable from '../stats/StandingsTable';
import MatchDetails from '../matches/MatchDetails';

// Et udvalg af turneringer fra jeres abonnement (de 12 tilgængelige).
const COMPETITIONS = [
  { code: 'BL1', name: 'Bundesliga (Tyskland)' },
  { code: 'PL', name: 'Premier League (England)' },
  { code: 'PD', name: 'La Liga (Spanien)' },
  { code: 'SA', name: 'Serie A (Italien)' },
  { code: 'FL1', name: 'Ligue 1 (Frankrig)' },
  { code: 'DED', name: 'Æresdivisionen (Holland)' },
  { code: 'PPL', name: 'Primeira Liga (Portugal)' },
  { code: 'CL', name: 'Champions League' },
];

function SampleMatch({ m }) {
  if (!m) return null;
  const date = m.utcDate ? new Date(m.utcDate).toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>📋 Eksempel-kamp</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Sådan ser et kampkort ud med fulde detaljer{date ? ` · ${date}` : ''}.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700, fontSize: '1.05rem' }}>
        <span>{m.homeName}</span>
        <span className="badge badge--blue">{m.result ? `${m.result.home}–${m.result.away}` : '—'}</span>
        <span>{m.awayName}</span>
      </div>
      <MatchDetails match={{ details: m.details }} homeName={m.homeName} awayName={m.awayName} />
    </div>
  );
}

export default function PreviewTab() {
  const [code, setCode] = useState('BL1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  async function handleFetch() {
    setBusy(true); setError(''); setData(null);
    const res = await callPreviewFootballData({ code });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setData(res.data);
  }

  // ── FIFA-sammenligning (verificering før evt. omlægning fra football-data) ──
  const [fifaBusy, setFifaBusy] = useState(false);
  const [fifaErr, setFifaErr] = useState('');
  const [fifa, setFifa] = useState(null);
  async function handleFifa() {
    setFifaBusy(true); setFifaErr(''); setFifa(null);
    const res = await callPreviewFifaData();
    setFifaBusy(false);
    if (!res.ok) { setFifaErr(res.error); return; }
    if (res.data?.error) { setFifaErr(res.data.error); return; }
    setFifa(res.data);
  }

  // ── Skygge-scoring: FIFA-afledte point vs. nuværende (rører vi spillet?) ──
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreErr, setScoreErr] = useState('');
  const [score, setScore] = useState(null);
  async function handleScoring() {
    setScoreBusy(true); setScoreErr(''); setScore(null);
    const res = await callPreviewFifaScoring();
    setScoreBusy(false);
    if (!res.ok) { setScoreErr(res.error); return; }
    if (res.data?.error) { setScoreErr(res.data.error); return; }
    setScore(res.data);
  }

  const compName = COMPETITIONS.find((c) => c.code === code)?.name ?? code;

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem', marginTop: 0 }}>
        Hent ægte data fra en aktiv turnering for at se, hvordan topscorer-ræs, stilling
        og kampdetaljer kommer til at se ud — før VM går i gang. Intet gemmes i basen.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}
          style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          {COMPETITIONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <button className="btn" onClick={handleFetch} disabled={busy}>
          {busy ? 'Henter…' : '🔄 Hent forhåndsvisning'}
        </button>
      </div>

      {error && (
        <div role="alert" className="card" style={{ borderColor: 'var(--c-err)', color: 'var(--c-err)', marginBottom: '1rem' }}>
          Fejl: {error}
        </div>
      )}

      {data && (
        <>
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Forhåndsvisning: {compName}</h2>
          {data.scorers?.length > 0
            ? <TopScorersList list={data.scorers} title="⚽ Topscorere" />
            : <div className="card" style={{ marginBottom: '1rem', color: 'var(--c-muted)' }}>Ingen topscorer-data{data.scorersError ? ` (${data.scorersError})` : ''}.</div>}
          <StandingsTable tables={data.standings} title="📊 Stilling med form" />
          <SampleMatch m={data.sampleMatch} />
        </>
      )}

      {/* ── FIFA-kilde: gratis alternativ, verificér mod vores gemte kampe ── */}
      <hr style={{ margin: '1.75rem 0', border: 'none', borderTop: '1px solid var(--c-border)' }} />
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem' }}>🆚 FIFA-kilde (gratis) — sammenlign med vores kampe</h2>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.88rem', margin: '0 0 0.75rem' }}>
        Henter VM-programmet direkte fra FIFAs gratis API, mapper det til vores skema og
        sammenligner med vores gemte kampe (kickoff, stadion, resultat). Verificering før en
        evt. omlægning væk fra football-data. Skriver intet.
      </p>
      <button className="btn" onClick={handleFifa} disabled={fifaBusy}>
        {fifaBusy ? 'Henter fra FIFA…' : '🆚 Hent & sammenlign FIFA'}
      </button>

      {fifaErr && (
        <div role="alert" className="card" style={{ borderColor: 'var(--c-err)', color: 'var(--c-err)', margin: '1rem 0' }}>
          Fejl: {fifaErr}
        </div>
      )}

      {fifa && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            FIFA leverede <strong>{fifa.fifaCount}</strong> kampe (sæson {fifa.season}).{' '}
            Runder: {Object.entries(fifa.byRound || {}).map(([r, n]) => `${r}:${n}`).join(', ')}
          </div>
          <div style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            Parret med vores kampe: <strong>{fifa.comparison?.matched}</strong> · uparrede hos os:{' '}
            {fifa.comparison?.unmatchedOurs} · <strong style={{ color: fifa.comparison?.diffCount ? 'var(--c-warn)' : 'var(--c-ok)' }}>
              {fifa.comparison?.diffCount} afvigelser
            </strong>
          </div>
          {fifa.comparison?.diffs?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: '0.8rem' }}>
                <thead><tr><th>Kamp</th><th>Felt</th><th>Vores</th><th>FIFA</th></tr></thead>
                <tbody>
                  {fifa.comparison.diffs.flatMap((d) => (
                    ['kickoff', 'venue', 'result'].filter((f) => d[f]).map((f) => (
                      <tr key={d.id + f}>
                        <td>{d.home}–{d.away}</td>
                        <td>{f}</td>
                        <td>{String(d[f].ours ?? '–')}</td>
                        <td>{String(d[f].fifa ?? '–')}{f === 'result' && d[f].fifaType ? ` (${d[f].fifaType})` : ''}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details style={{ marginTop: '0.75rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--c-muted)' }}>Vis 8 eksempel-kampe fra FIFA</summary>
            <table className="table" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
              <thead><tr><th>Runde</th><th>Kamp</th><th>Stadion</th><th>By</th><th>Resultat</th></tr></thead>
              <tbody>
                {fifa.sample.map((s, i) => (
                  <tr key={i}>
                    <td>{s.round}</td><td>{s.home ?? '?'}–{s.away ?? '?'}</td>
                    <td>{s.venue}</td><td>{s.city}</td>
                    <td>{s.result ? `${s.result.home}–${s.result.away}` : s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {/* ── Skygge-scoring: bevis at et kildeskift ikke rører spillet ── */}
      <hr style={{ margin: '1.75rem 0', border: 'none', borderTop: '1px solid var(--c-border)' }} />
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem' }}>🎯 Skygge-scoring — FIFA-point vs. nuværende</h2>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.88rem', margin: '0 0 0.75rem' }}>
        Beregner hvad hvert tip (og hver spillers samlede kamp-point) <em>ville</em> blive hvis vi
        scorede mod FIFA-resultater — og sammenligner med de nuværende gemte point. Skriver intet.
        <strong> 0 forskelle = et skift til FIFA rører ikke selve spillet.</strong>
      </p>
      <button className="btn" onClick={handleScoring} disabled={scoreBusy}>
        {scoreBusy ? 'Beregner…' : '🎯 Kør skygge-scoring'}
      </button>

      {scoreErr && (
        <div role="alert" className="card" style={{ borderColor: 'var(--c-err)', color: 'var(--c-err)', margin: '1rem 0' }}>
          Fejl: {scoreErr}
        </div>
      )}

      {score && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem',
            color: (score.betDiffCount === 0 && score.userDiffCount === 0) ? 'var(--c-ok)' : 'var(--c-warn)' }}>
            {(score.betDiffCount === 0 && score.userDiffCount === 0)
              ? '✅ Ingen forskelle — FIFA giver præcis samme point som nu.'
              : `⚠️ ${score.betDiffCount} tip og ${score.userDiffCount} spillere ville få andre point.`}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
            {score.matchesConsidered} afsluttede kampe · {score.betsScored} tip scoret
            {score.skippedCount > 0 ? ` · ${score.skippedCount} kampe sprunget over` : ''}
          </div>
          {score.userDiffs?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: '0.8rem' }}>
                <thead><tr><th>Spiller (uid)</th><th>Nu</th><th>FIFA</th><th>Δ</th></tr></thead>
                <tbody>
                  {score.userDiffs.map((u) => (
                    <tr key={u.uid}>
                      <td style={{ fontFamily: 'monospace' }}>{u.uid.slice(0, 10)}…</td>
                      <td>{u.storedTotal}</td><td>{u.fifaTotal}</td>
                      <td style={{ color: u.delta > 0 ? 'var(--c-ok)' : 'var(--c-err)' }}>{u.delta > 0 ? '+' : ''}{u.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {score.betDiffs?.length > 0 && (
            <details style={{ marginTop: '0.6rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--c-muted)' }}>Vis tip-forskelle</summary>
              <table className="table" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
                <thead><tr><th>Kamp</th><th>Spiller</th><th>Nu</th><th>FIFA</th></tr></thead>
                <tbody>
                  {score.betDiffs.map((b, i) => (
                    <tr key={i}>
                      <td>{b.home}–{b.away}</td>
                      <td style={{ fontFamily: 'monospace' }}>{b.uid.slice(0, 8)}…</td>
                      <td>{b.stored}</td><td>{b.fifa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {score.skipped?.length > 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginTop: '0.5rem' }}>
              Sprunget over: {score.skipped.map((s) => `${s.id} (${s.reason})`).join(', ')}
            </div>
          )}
          <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginTop: '0.5rem' }}>{score.note}</p>
        </div>
      )}
    </div>
  );
}
