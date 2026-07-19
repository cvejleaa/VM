// Landeoversigt på Fakta-siden: mål for/imod, straffemål, selvmål for/imod og
// gule/røde kort pr. nation — bygget på kampenes mål-feed + kort (details).
import { useState } from 'react';
import { computeCountryStats } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';

// Kolonner: nøgle + kort header + fuld titel (tooltip). Alle numeriske sorteres faldende.
const COLS = [
  { key: 'goalsFor', head: 'Mål', title: 'Mål scoret (for)' },
  { key: 'goalsAgainst', head: 'Imod', title: 'Mål indkasseret (imod)' },
  { key: 'penaltyFor', head: 'Str.', title: 'Mål scoret på straffe' },
  { key: 'ownFor', head: 'Selv ▲', title: 'Selvmål i landets favør (for)' },
  { key: 'ownAgainst', head: 'Selv ▼', title: 'Selvmål begået af landet (imod)' },
  { key: 'yellow', head: '🟨', title: 'Gule kort' },
  { key: 'red', head: '🟥', title: 'Røde kort' },
];

export default function CountryStatsCard({ matches }) {
  const { list, totals } = computeCountryStats(matches);
  const [sortKey, setSortKey] = useState('goalsFor');

  if (list.length === 0 || totals.goalsFor === 0) return null;

  const rows = [...list].sort((a, b) =>
    b[sortKey] - a[sortKey] || teamName(a.code).localeCompare(teamName(b.code), 'da'));

  const th = (c) => (
    <th
      key={c.key}
      title={c.title}
      onClick={() => setSortKey(c.key)}
      style={{
        textAlign: 'right', padding: '0.4rem 0.5rem', cursor: 'pointer', whiteSpace: 'nowrap',
        color: sortKey === c.key ? 'var(--c-text)' : 'var(--c-muted)',
        fontWeight: sortKey === c.key ? 800 : 600,
      }}
    >
      {c.head}{sortKey === c.key ? ' ▾' : ''}
    </th>
  );

  const num = (key, v) => (
    <td key={key} style={{ textAlign: 'right', padding: '0.35rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>
      {v > 0 ? v : <span style={{ color: 'var(--c-muted)' }}>0</span>}
    </td>
  );

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>🌍 Landeoversigt</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Mål, straffemål, selvmål og kort pr. nation over de afsluttede kampe. Tryk på en kolonne for at sortere.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--c-muted)', fontWeight: 600 }}>Land</th>
              {COLS.map(th)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Flag code={r.code} size={18} /> {teamName(r.code)}
                  </span>
                </td>
                {COLS.map((c) => num(c.key, r[c.key]))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--c-border)', fontWeight: 700 }}>
              <td style={{ padding: '0.4rem 0.5rem' }}>I alt ({rows.length})</td>
              {COLS.map((c) => (
                <td key={c.key} style={{ textAlign: 'right', padding: '0.4rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                  {totals[c.key]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
