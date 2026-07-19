// Fase 3-fakta: turneringens målmand (FIFA-power-index for keepere) og
// straffesparkstavle (spark-for-spark i hver straffekonkurrence).
import { useState } from 'react';
import { computeGoalkeeperRanking, computePenaltyShootouts } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import PlayerLink from '../../components/PlayerLink';

// ── Turneringens målmand ─────────────────────────────────────────────────────
export function GoalkeeperCard({ matches }) {
  const list = computeGoalkeeperRanking(matches);
  const [showAll, setShowAll] = useState(false);
  if (list.length === 0) return null;
  const shown = showAll ? list : list.slice(0, 8);
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>🧤 Turneringens målmand</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Gennemsnitlig FIFA-forsvarsscore (defending) pr. målmand over deres kampe.
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {shown.map((k, i) => (
          <li key={k.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.9rem' }}>
            <span style={{ width: '1.6rem', textAlign: 'right', color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
            {k.picture
              ? <img src={k.picture} alt="" width={26} height={26} style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--c-border)' }} loading="lazy" />
              : <span style={{ width: 26 }} />}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {k.code && <Flag code={k.code} size={16} />}
              <PlayerLink id={k.id} style={{ fontWeight: 600 }}>{k.name}</PlayerLink>
              <span style={{ color: 'var(--c-muted)', fontSize: '0.75rem' }}>· {k.matches} kampe</span>
            </span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }} title="Gnsn. forsvarsscore">{k.avgDef}</strong>
          </li>
        ))}
      </ol>
      {list.length > 8 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="btn btn--ghost btn--sm" style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
          {showAll ? 'Vis top 8' : `Vis alle (${list.length})`}
        </button>
      )}
    </div>
  );
}

// ── Straffesparkstavle ───────────────────────────────────────────────────────
function KickRow({ side, kicks, teamCode, scored }) {
  const own = kicks.filter((k) => k.side === side);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.15rem 0' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', width: 130, minWidth: 130 }}>
        <Flag code={teamCode} size={16} /> <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{teamName(teamCode)}</span>
      </span>
      <span style={{ display: 'flex', gap: '0.15rem', flexWrap: 'wrap', flex: 1 }}>
        {own.map((k, i) => (
          <span key={i} title={k.player || ''} style={{ fontSize: '0.85rem' }}>{k.scored ? '✅' : '❌'}</span>
        ))}
      </span>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{scored}</strong>
    </div>
  );
}

export function PenaltyShootoutCard({ matches }) {
  const { shootouts, missers } = computePenaltyShootouts(matches);
  if (shootouts.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>🥅 Straffesparkskonkurrencer</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Spark-for-spark. ✅ scoret · ❌ brændt (hold musen over for skytten).
      </div>
      {shootouts.map((s) => (
        <div key={s.id} style={{ borderTop: '1px solid var(--c-border)', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
          <KickRow side="home" kicks={s.kicks} teamCode={s.home} scored={s.homeScored} />
          <KickRow side="away" kicks={s.kicks} teamCode={s.away} scored={s.awayScored} />
        </div>
      ))}
      {missers.length > 0 && (
        <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Flest brændte: {missers.slice(0, 5).map((t, i) => (
            <span key={t.name}>{i > 0 ? ' · ' : ''}<PlayerLink id={t.id}>{t.name}</PlayerLink> ({t.missed})</span>
          ))}
        </div>
      )}
    </div>
  );
}
