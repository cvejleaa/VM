// 👟 Spiller-toplister: vælg et nøgletal og se de bedste spillere på tværs af
// turneringen (fra details.playerStats). Skud, træfsikkerhed, assists, tophastighed, løb.
import { useState } from 'react';
import { computePlayerLeaderboards } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import PlayerLink from '../../components/PlayerLink';

const BOARDS = [
  { key: 'shots', label: '👟 Flest skud', unit: '', suffix: '' },
  { key: 'accuracy', label: '🎯 Træfsikkerhed', unit: '%', suffix: '%' },
  { key: 'assists', label: '🅰️ Assists', unit: '', suffix: '' },
  { key: 'topSpeed', label: '🏃 Tophastighed', unit: 'km/t', suffix: ' km/t' },
  { key: 'distance', label: '🛣️ Løbedistance', unit: 'km', suffix: ' km' },
];

export default function PlayerLeaderboardCard({ matches }) {
  const data = computePlayerLeaderboards(matches);
  const [key, setKey] = useState('shots');
  const rows = data[key] || [];
  const board = BOARDS.find((b) => b.key === key);

  // Vis intet før der er per-spiller-data.
  if (BOARDS.every((b) => (data[b.key] || []).length === 0)) return null;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.15rem' }}>👟 Spiller-toplister</h2>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        {BOARDS.map((b) => (
          <button key={b.key} type="button" onClick={() => setKey(b.key)}
            className={`btn btn--sm ${key === b.key ? '' : 'btn--ghost'}`}
            style={{ fontSize: '0.76rem' }}>{b.label}</button>
        ))}
      </div>
      {rows.length === 0
        ? <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>Ingen data endnu.</div>
        : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((p, i) => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.9rem' }}>
                <span style={{ width: '1.6rem', textAlign: 'right', color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                {p.code && <Flag code={p.code} size={16} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <PlayerLink id={p.id} style={{ fontWeight: 600 }}>{p.name}</PlayerLink>
                  <span style={{ color: 'var(--c-muted)', fontSize: '0.78rem' }}> · {p.code ? teamName(p.code) : ''}</span>
                </span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }} title={p.sub || ''}>{p.value}{board.suffix}</strong>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
