// Kapløbet om guldstøvlen — turneringens topscorere fra football-data.org.
// TopScorersList er ren præsentation (genbruges i forhåndsvisningen);
// TopScorersCard henter live-data via hook'en.
import { useTopScorers } from './useTopScorers';

const MEDAL = ['🥇', '🥈', '🥉'];

function formatUpdated(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

/**
 * @param {{ list: Array<object>, limit?: number, title?: string, updatedAt?: any }} props
 */
export function TopScorersList({ list, limit = 10, title = '⚽ Kapløbet om guldstøvlen', updatedAt = null }) {
  if (!list || list.length === 0) return null;
  const rows = list.slice(0, limit);
  const updated = formatUpdated(updatedAt);
  const showAssists = rows.some((r) => r.assists != null);
  const showPens = rows.some((r) => r.penalties != null && r.penalties > 0);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>{title}</h2>
        {updated && <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>Opdateret {updated}</span>}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
        {rows.map((s) => (
          <li
            key={`${s.rank}-${s.playerId ?? s.playerName}`}
            style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0',
              borderBottom: '1px solid var(--c-border)',
            }}
          >
            <span style={{ width: 28, textAlign: 'center', fontWeight: 700 }}>
              {MEDAL[s.rank - 1] ?? s.rank}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{s.playerName}</span>
              {s.teamName && (
                <span style={{ color: 'var(--c-muted)', fontSize: '0.82rem' }}> · {s.teamName}</span>
              )}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <strong style={{ fontSize: '1.05rem' }}>{s.goals}</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>mål</span>
              {showAssists && s.assists != null && (
                <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>· {s.assists} a</span>
              )}
              {showPens && s.penalties != null && s.penalties > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }} title="straffemål">· {s.penalties} str.</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TopScorersCard({ limit = 10 }) {
  const { list, updatedAt, loading } = useTopScorers();
  // Vis intet hvis der ikke er data endnu (fx før turneringen).
  if (loading) return null;
  return <TopScorersList list={list} updatedAt={updatedAt} limit={limit} />;
}
