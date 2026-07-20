// 🏆 Turneringens hold: FIFA-power-indeksets bedste 11'er (4-3-3) tegnet på en
// lodret bane — målmand nederst, så forsvar, midtbane og angreb opad. Hver
// spiller er klikbar (→ spillerside) med land og power-score.
import { computeTeamOfTournament } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import PlayerLink from '../../components/PlayerLink';

function PlayerChip({ p, metric }) {
  if (!p) return null;
  const score = metric ? p[metric] : p.avgTotal;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', width: 74, textAlign: 'center' }}>
      {p.picture
        ? <img src={p.picture} alt="" width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover', background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.85)' }} loading="lazy" />
        : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', border: '2px solid rgba(255,255,255,0.85)' }} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', fontSize: '0.7rem', lineHeight: 1.15 }}>
        {p.code && <Flag code={p.code} size={13} />}
        <PlayerLink id={p.id} style={{ color: '#fff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>{p.name}</PlayerLink>
      </div>
      {score != null && (
        <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{score}</span>
      )}
    </div>
  );
}

function Line({ players, metric }) {
  if (!players || players.length === 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', width: '100%', gap: '0.25rem' }}>
      {players.map((p, i) => <PlayerChip key={p.id ?? p.name ?? i} p={p} metric={metric} />)}
    </div>
  );
}

export default function TeamOfTournamentCard({ matches }) {
  const xi = computeTeamOfTournament(matches);
  if (!xi) return null;
  const { gk, defenders, midfielders, forwards } = xi;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>🏆 Turneringens hold</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.6rem' }}>
        Bedste 11&apos;er (4-3-3) ud fra FIFA-power-indekset: angribere valgt på angrebsscore,
        midtbane på kreativitet, forsvar på forsvarsscore, målmand på forsvarsscore.
      </div>
      <div style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        gap: '1.1rem', padding: '1.1rem 0.4rem',
        borderRadius: 12,
        background: 'linear-gradient(180deg, #15803d 0%, #16a34a 100%)',
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.25)',
        overflow: 'hidden',
      }}>
        {/* Banemarkeringer */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.3)' }} />
          <div style={{ position: 'absolute', top: 'calc(50% - 42px)', left: 'calc(50% - 42px)', width: 84, height: 84, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)' }} />
          <div style={{ position: 'absolute', top: -1, left: 'calc(50% - 55px)', width: 110, height: 34, border: '1px solid rgba(255,255,255,0.3)', borderTop: 'none' }} />
          <div style={{ position: 'absolute', bottom: -1, left: 'calc(50% - 55px)', width: 110, height: 34, border: '1px solid rgba(255,255,255,0.3)', borderBottom: 'none' }} />
        </div>
        <Line players={forwards} metric="avgAtt" />
        <Line players={midfielders} metric="avgCre" />
        <Line players={defenders} metric="avgDef" />
        {gk && (
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <PlayerChip p={{ ...gk, avgTotal: gk.avgDef }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--c-muted)', textAlign: 'center', marginTop: '0.4rem' }}>
        Tallene er gennemsnitlig power-score for spillerens rolle over vedkommendes kampe.
        {gk && <> Målmand: <PlayerLink id={gk.id} style={{ fontWeight: 600 }}>{gk.name}</PlayerLink>{gk.code ? ` (${teamName(gk.code)})` : ''}.</>}
      </div>
    </div>
  );
}
