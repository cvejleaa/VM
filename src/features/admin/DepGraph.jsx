// Arkitektur-/afhængighedsdiagram tegnet som SVG ud fra de faktiske imports
// i koden (src/data/depGraph.json, genereret af scripts/build-dep-graph.mjs).
import graph from '../../data/depGraph.json';

const W = 1000;
const ROW_H = 118;
const TOP = 46;
const NODE_W = 132;
const NODE_H = 40;

// Farve pr. kategori
function colorFor(id, layer) {
  if (id === 'firebase' || id === 'Cloud Functions') return { fill: '#fff4e6', stroke: '#e8a317', text: '#9a6a00' };
  if (id === 'lib (kerne)') return { fill: '#f3eaff', stroke: '#8b5cf6', text: '#5b21b6' };
  if (id === 'context') return { fill: '#e9f0ff', stroke: '#3b6fd6', text: '#1e40af' };
  if (id === 'components') return { fill: '#e6fbf6', stroke: '#0d9488', text: '#0f766e' };
  if (id === 'pages') return { fill: '#fff7e0', stroke: '#d6a700', text: '#7a5a00' };
  if (id === 'app-skal') return { fill: '#eef2f6', stroke: '#475569', text: '#334155' };
  if (layer === 2) return { fill: 'rgba(11,110,79,0.10)', stroke: '#0b6e4f', text: '#074b36' }; // features
  return { fill: 'var(--c-bg)', stroke: 'var(--c-border)', text: 'var(--c-text)' };
}

function shortLabel(id) {
  return id.startsWith('features/') ? id.slice('features/'.length) : id;
}

export default function DepGraph() {
  const layers = [...new Set(graph.nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const maxLayer = Math.max(...layers);
  const H = TOP + (maxLayer + 1) * ROW_H;

  // Positioner: y efter lag (højt lag = øverst), x jævnt fordelt i laget
  const pos = {};
  for (const layer of layers) {
    const inLayer = graph.nodes.filter((n) => n.layer === layer);
    inLayer.forEach((n, i) => {
      pos[n.id] = {
        x: ((i + 1) / (inLayer.length + 1)) * W,
        y: TOP + (maxLayer - layer) * ROW_H,
      };
    });
  }

  const maxCount = Math.max(...graph.edges.map((e) => e.count), 1);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560, display: 'block' }} role="img"
        aria-label="Afhængighedsdiagram over kodemodulerne">
        <defs>
          <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--c-muted)" />
          </marker>
        </defs>

        {/* Kanter (importer → importeret) */}
        {graph.edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to];
          if (!a || !b) return null;
          const x1 = a.x, y1 = a.y + NODE_H / 2;       // bund af importer
          const x2 = b.x, y2 = b.y - NODE_H / 2;        // top af importeret
          const my = (y1 + y2) / 2;
          const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
          const sw = Math.max(1, Math.min(4, e.count / (maxCount / 4)));
          return (
            <path key={i} d={d} fill="none" stroke="var(--c-muted)"
              strokeWidth={sw} strokeOpacity={0.35} markerEnd="url(#dep-arrow)" />
          );
        })}

        {/* Noder */}
        {graph.nodes.map((n) => {
          const p = pos[n.id];
          const c = colorFor(n.id, n.layer);
          return (
            <g key={n.id} transform={`translate(${p.x - NODE_W / 2}, ${p.y - NODE_H / 2})`}>
              <rect width={NODE_W} height={NODE_H} rx="9" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
              <text x={NODE_W / 2} y={NODE_H / 2 - 2} textAnchor="middle" fontSize="13" fontWeight="700" fill={c.text}>
                {shortLabel(n.id)}
              </text>
              <text x={NODE_W / 2} y={NODE_H / 2 + 12} textAnchor="middle" fontSize="9.5" fill="var(--c-muted)">
                {n.files} fil{n.files === 1 ? '' : 'er'}
              </text>
            </g>
          );
        })}
      </svg>
      <p style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>
        Pilene viser hvilke moduler der importerer hvilke (nederst = fundament, øverst = app-skal).
        Tykkere pile = flere imports.
      </p>
    </div>
  );
}
