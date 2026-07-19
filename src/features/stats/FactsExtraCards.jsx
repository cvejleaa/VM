// Fase 1-fakta: xG over/underpræstation, turneringens rekorder og MVP-tælling.
// Bygger på data der allerede ligger på kampene (stats.xg, mål-feed, power-index).
import { useState } from 'react';
import { computeXgOverUnder, computeRecords, computeMvpTally } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';

const minLabel = (r) => (r == null ? '' : (r.injuryTime ? `${r.minute}+${r.injuryTime}'` : `${r.minute}'`));

// ── xG over/underpræstation ──────────────────────────────────────────────────
export function XgCard({ matches }) {
  const list = computeXgOverUnder(matches);
  if (list.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>🎯 xG — hvem var klinisk?</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Faktiske mål vs. forventede mål (xG). Grøn = scorede mere end chancerne tilsagde; rød = sløsede.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border)', color: 'var(--c-muted)' }}>
              <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontWeight: 600 }}>Land</th>
              <th style={{ textAlign: 'right', padding: '0.35rem 0.5rem', fontWeight: 600 }}>Mål</th>
              <th style={{ textAlign: 'right', padding: '0.35rem 0.5rem', fontWeight: 600 }}>xG</th>
              <th style={{ textAlign: 'right', padding: '0.35rem 0.5rem', fontWeight: 600 }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.code} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ padding: '0.3rem 0.5rem', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Flag code={r.code} size={18} /> {teamName(r.code)}
                  </span>
                </td>
                <td style={{ textAlign: 'right', padding: '0.3rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>{r.goals}</td>
                <td style={{ textAlign: 'right', padding: '0.3rem 0.5rem', fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{r.xg.toFixed(1)}</td>
                <td style={{ textAlign: 'right', padding: '0.3rem 0.5rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                  color: r.diff > 0 ? 'var(--c-ok, #16a34a)' : r.diff < 0 ? 'var(--c-err, #dc2626)' : 'var(--c-muted)' }}>
                  {r.diff > 0 ? '+' : ''}{r.diff.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Turneringens rekorder ────────────────────────────────────────────────────
function RecordRow({ icon, title, m, detail }) {
  if (!m) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0', borderBottom: '1px solid var(--c-border)' }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Flag code={m.home} size={16} /> {teamName(m.home)} <span style={{ color: 'var(--c-muted)' }}>–</span> {teamName(m.away)} <Flag code={m.away} size={16} />
        </div>
      </div>
      <div style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{detail}</div>
    </div>
  );
}

export function RecordsCard({ matches }) {
  const r = computeRecords(matches);
  if (!r.highest && !r.fastest) return null;
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>🏅 Rekorder</h2>
      <RecordRow icon="⚡" title="Hurtigste mål" m={r.fastest} detail={`${minLabel(r.fastest)}${r.fastest?.scorer ? ` · ${r.fastest.scorer}` : ''}`} />
      <RecordRow icon="🕐" title="Seneste mål" m={r.latest} detail={`${minLabel(r.latest)}${r.latest?.scorer ? ` · ${r.latest.scorer}` : ''}`} />
      <RecordRow icon="💥" title="Største sejr" m={r.biggestWin} detail={r.biggestWin?.score} />
      <RecordRow icon="🥅" title="Mål-rigeste kamp" m={r.highest} detail={`${r.highest?.score} (${r.highest?.total})`} />
      <RecordRow icon="🔄" title="Største comeback" m={r.comeback} detail={r.comeback ? `bagud ${r.comeback.deficit} → ${r.comeback.score}` : ''} />
    </div>
  );
}

// ── Turneringens MVP ─────────────────────────────────────────────────────────
export function MvpCard({ matches }) {
  const list = computeMvpTally(matches);
  const [showAll, setShowAll] = useState(false);
  if (list.length === 0) return null;
  const shown = showAll ? list : list.slice(0, 10);
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>⭐ Kampens spiller — turneringens MVP</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Antal kampe hvor spilleren toppede FIFA-power-indekset.
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {shown.map((p, i) => (
          <li key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.9rem' }}>
            <span style={{ width: '1.6rem', textAlign: 'right', color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
            {p.picture
              ? <img src={p.picture} alt="" width={26} height={26} style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--c-border)' }} loading="lazy" />
              : <span style={{ width: 26 }} />}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {p.code && <Flag code={p.code} size={16} />}
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              {p.code && <span style={{ color: 'var(--c-muted)', fontSize: '0.8rem' }}>· {teamName(p.code)}</span>}
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.count}×</span>
          </li>
        ))}
      </ol>
      {list.length > 10 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="btn btn--ghost btn--sm" style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
          {showAll ? 'Vis top 10' : `Vis alle (${list.length})`}
        </button>
      )}
    </div>
  );
}
