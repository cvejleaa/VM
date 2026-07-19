// ⚡ Hold-stil-radar: vælg et hold og se dets spil-profil (pres, opspil, fremdrift,
// sidste tredjedel, kontra, lav blok) — normaliseret 0-100 ift. feltet.
import { useState } from 'react';
import { computeTeamStyles } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';

const N = 6;
const R = 40; // maks radius i SVG-enheder (center 50,50)
const angleAt = (i) => (-90 + i * (360 / N)) * (Math.PI / 180);
const pt = (i, v) => {
  const r = (v / 100) * R;
  return [50 + r * Math.cos(angleAt(i)), 50 + r * Math.sin(angleAt(i))];
};
const polygon = (values) => values.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');

export default function StyleRadarCard({ matches }) {
  const { axes, teams } = computeTeamStyles(matches);
  const [code, setCode] = useState(null);
  if (teams.length === 0) return null;
  const sel = teams.find((t) => t.code === code) || teams[0];

  const grid = [25, 50, 75, 100];
  const ink = 'var(--c-muted, #888)';

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>⚡ Hold-stil</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        Spil-profil ud fra minutter i hver spilfase, normaliseret ift. feltet (100 = højest i turneringen).
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <Flag code={sel.code} size={20} />
        <select value={sel.code} onChange={(e) => setCode(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--c-border)', fontSize: '0.9rem' }}>
          {teams.map((t) => <option key={t.code} value={t.code}>{teamName(t.code)}</option>)}
        </select>
        <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>{sel.matches} kampe</span>
      </div>
      <div style={{ maxWidth: 340, margin: '0 auto' }}>
        <svg viewBox="-28 -6 156 112" width="100%" role="img" aria-label={`Stil-radar for ${teamName(sel.code)}`}>
          {grid.map((g) => (
            <polygon key={g} points={polygon(Array(N).fill(g))} fill="none" stroke="var(--c-border,#e0e0e0)" strokeWidth="0.3" />
          ))}
          {axes.map((_, i) => {
            const [x, y] = pt(i, 100);
            return <line key={i} x1="50" y1="50" x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="var(--c-border,#e0e0e0)" strokeWidth="0.3" />;
          })}
          <polygon points={polygon(sel.values)} fill="var(--c-pitch, #16a34a)" fillOpacity="0.25" stroke="var(--c-pitch,#16a34a)" strokeWidth="0.8" />
          {sel.values.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="1" fill="var(--c-pitch,#16a34a)" />; })}
          {axes.map((label, i) => {
            const [x, y] = pt(i, 113);
            return <text key={i} x={x.toFixed(1)} y={y.toFixed(1)} fontSize="4.4" fill={ink}
              textAnchor={x < 45 ? 'end' : x > 55 ? 'start' : 'middle'} dominantBaseline="middle">{label}</text>;
          })}
        </svg>
      </div>
    </div>
  );
}
