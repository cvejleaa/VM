// ---------------------------------------------------------------------------
// MatchDetails – viser kampdetaljer fra football-data.org (gemt på match.details
// af Cloud Function syncMatchDetails): mål-feed, kort, halvleg/straffe/tilskuere
// og en udfoldelig opstilling pr. hold.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { flipSide, goalsWithRunningScore } from './matchHelpers';

const CARD_ICON = { YELLOW: '🟨', RED: '🟥', YELLOW_RED: '🟨🟥' };

function goalSuffix(type) {
  if (type === 'PENALTY') return ' (str.)';
  if (type === 'OWN') return ' (selvmål)';
  return '';
}

function minuteLabel(ev) {
  if (ev.minute == null) return '';
  return ev.injuryTime ? `${ev.minute}+${ev.injuryTime}'` : `${ev.minute}'`;
}

function eventText(ev) {
  if (ev.kind === 'goal') {
    return `${ev.scorer ?? '?'}${ev.assist ? ` (assist: ${ev.assist})` : ''}${goalSuffix(ev.type)}`;
  }
  if (ev.kind === 'sub') {
    return `${ev.playerIn ?? '?'} ↑ ${ev.playerOut ?? '?'} ↓`;
  }
  return `${ev.player ?? '?'}`;
}

function eventIcon(ev) {
  if (ev.kind === 'goal') return '⚽';
  if (ev.kind === 'sub') return '🔄';
  return CARD_ICON[ev.card] ?? '🟨';
}

// Ikon for en FIFA-feed-hændelse (ud fra type/label).
function feedIcon(ev) {
  const t = ev.type;
  const label = (ev.label || '').toLowerCase();
  if (t === 0 || t === 41) return '⚽';
  if (label.includes('red')) return '🟥';
  if (label.includes('yellow') || t === 2) return '🟨';
  if (t === 5) return '🔄';
  if (t === 57 || label.includes('prevention') || label.includes('save')) return '🧤';
  if (t === 12 || label.includes('attempt') || label.includes('shot')) return '👟';
  if (t === 16 || label.includes('corner')) return '🚩';
  if (t === 15 || label.includes('offside')) return '🚫';
  if (t === 18 || label.includes('foul')) return '⚠️';
  if (t === 71 || label.includes('var')) return '📺';
  if (t === 26 || t === 8) return '🏁';
  if (t === 7 || t === 78) return '▶️';
  return '•';
}

// Én række i det fulde live-feed (FIFA-kommentar).
function FeedRow({ ev }) {
  const min = ev.minute == null ? '' : (ev.injuryTime ? `${ev.minute}+${ev.injuryTime}'` : `${ev.minute}'`);
  const isGoal = ev.type === 0 || ev.type === 41;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '0.5rem', alignItems: 'baseline',
      padding: '0.2rem 0', fontSize: '0.8rem', borderBottom: '1px solid var(--c-border, #eee)',
    }}>
      <span style={{ color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{min}</span>
      <span>{feedIcon(ev)}</span>
      <span style={{ fontWeight: isGoal ? 700 : 400 }}>
        {ev.text}
        {isGoal && ev.home != null && <span style={{ color: 'var(--c-muted)' }}> ({ev.home}–{ev.away})</span>}
      </span>
    </div>
  );
}

// Én begivenheds-række (mål, kort eller udskiftning), venstre = hjemme, højre = ude.
function EventRow({ ev }) {
  const home = ev.side === 'home';
  const text = eventText(ev);
  const icon = eventIcon(ev);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      gap: '0.5rem', fontSize: '0.82rem', padding: '0.15rem 0',
    }}>
      <div style={{ textAlign: 'right', color: home ? 'var(--c-text)' : 'transparent' }}>
        {home && <span>{text} {icon}</span>}
      </div>
      <div style={{
        color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}>
        <span>{minuteLabel(ev)}</span>
        {ev.kind === 'goal' && ev.score && (
          <span
            data-testid="running-score"
            style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-text)',
              background: 'var(--c-border)', borderRadius: 4, padding: '0 0.25rem',
            }}
          >
            {ev.score.home}–{ev.score.away}
          </span>
        )}
      </div>
      <div style={{ textAlign: 'left', color: !home ? 'var(--c-text)' : 'transparent' }}>
        {!home && <span>{icon} {text}</span>}
      </div>
    </div>
  );
}

function TeamLineup({ title, team }) {
  if (!team || (!team.lineup?.length && !team.bench?.length)) return null;
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
        {title}{team.formation ? ` · ${team.formation}` : ''}
      </div>
      {team.coach && <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>Træner: {team.coach}</div>}
      <ol style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
        {team.lineup.map((p, i) => (
          <li key={`${p.name}-${i}`}>
            {`${p.shirt != null ? `${p.shirt}. ` : ''}${p.name}`}
            {p.position ? <span style={{ color: 'var(--c-muted)' }}> · {p.position}</span> : null}
          </li>
        ))}
      </ol>
      {team.bench?.length > 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--c-muted)', marginTop: '0.3rem' }}>
          Bænk: {team.bench.map((p) => p.name).join(', ')}
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ match: object, homeName: string, awayName: string }} props
 */
export default function MatchDetails({ match, homeName, awayName }) {
  const [showLineups, setShowLineups] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [feedAll, setFeedAll] = useState(false);
  const d = match.details;
  if (!d) return null;

  // Saml mål + kort + udskiftninger kronologisk. Mål får den løbende stilling,
  // og selvmål tæller for modstanderen — så de vises på den modsatte side (med
  // scorerens navn + "(selvmål)"), mens selve scoren regnes på de rå mål.
  const events = [
    ...goalsWithRunningScore(d.goals ?? []).map((g) => ({
      ...g, kind: 'goal', side: g.type === 'OWN' ? flipSide(g.side) : g.side,
    })),
    ...(d.bookings ?? []).map((b) => ({ ...b, kind: 'card' })),
    ...(d.substitutions ?? []).map((s) => ({ ...s, kind: 'sub' })),
  ].sort((a, b) => ((a.minute ?? 999) - (b.minute ?? 999)) || ((a.injuryTime ?? 0) - (b.injuryTime ?? 0)));

  const meta = [];
  if (d.halfTime) meta.push(`Halvleg ${d.halfTime.home}–${d.halfTime.away}`);
  if (d.penalties) meta.push(`Straffe ${d.penalties.home}–${d.penalties.away}`);
  if (d.attendance != null) meta.push(`${d.attendance.toLocaleString('da-DK')} tilskuere`);
  if (d.referee) meta.push(`Dommer: ${d.referee}`);

  const hasLineups = !!d.lineups && (d.lineups.home?.lineup?.length || d.lineups.away?.lineup?.length);

  // Fuldt live hændelses-feed (FIFA). Nyeste øverst; kan filtreres til store hændelser.
  const feed = Array.isArray(d.events) ? d.events : [];
  const feedShown = (feedAll ? feed : feed.filter((e) => e.major)).slice().reverse();

  if (events.length === 0 && meta.length === 0 && !hasLineups && feed.length === 0) return null;

  return (
    <div style={{ marginBottom: '0.6rem', borderTop: '1px solid var(--c-border)', paddingTop: '0.5rem' }}>
      {events.length > 0 && (
        <div style={{ marginBottom: meta.length ? '0.4rem' : 0 }}>
          {events.map((ev, i) => <EventRow key={i} ev={ev} />)}
        </div>
      )}

      {meta.length > 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--c-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {meta.map((t) => <span key={t}>{t}</span>)}
        </div>
      )}

      {feed.length > 0 && (
        <div style={{ marginTop: '0.4rem' }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowFeed((v) => !v)}
            aria-expanded={showFeed}
            data-testid="toggle-feed"
          >
            {showFeed ? '▾ Skjul kampforløb' : '▸ Vis kampforløb (live)'}
          </button>
          {showFeed && (
            <div style={{ marginTop: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--c-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
                <input type="checkbox" checked={feedAll} onChange={(e) => setFeedAll(e.target.checked)} />
                Vis alt (også skud, hjørner, offside)
              </label>
              <div data-testid="live-feed">
                {feedShown.map((ev, i) => <FeedRow key={i} ev={ev} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {hasLineups && (
        <div style={{ marginTop: '0.4rem' }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowLineups((v) => !v)}
            aria-expanded={showLineups}
          >
            {showLineups ? '▾ Skjul opstillinger' : '▸ Vis opstillinger'}
          </button>
          {showLineups && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <TeamLineup title={homeName} team={d.lineups.home} />
              <TeamLineup title={awayName} team={d.lineups.away} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
