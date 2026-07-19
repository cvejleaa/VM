import { describe, it, expect } from 'vitest';
import { buildShotPoints } from './ShotMap';

// FIFA-koordinaten er absolut: holdene skifter banehalvdel ved pausen. I 1. halvleg
// (Period 3) angriber hjemme høj X; i 2. halvleg (Period 5) lav X. buildShotPoints
// skal normalisere, så hjemmes skud altid ligger i høj X (og modstanderens i lav).
describe('buildShotPoints', () => {
  const events = [
    { type: 12, side: 'home', period: 3, x: 90, y: 40, minute: 10 }, // 1. halvleg, angriber høj X
    { type: 0, side: 'away', period: 3, x: 12, y: 55, minute: 20 },  // ude angriber lav X → mål
    { type: 12, side: 'home', period: 5, x: 14, y: 60, minute: 60 }, // 2. halvleg: hjemme nu lav X → skal flippes
    { type: 5, side: 'home', period: 5, x: 30, y: 30 },              // udskiftning (ikke skud) → udelades
    { type: 12, side: 'away', period: 5, x: 88, y: 45, minute: 65 }, // ude nu høj X → skal flippes til lav
  ];
  const pts = buildShotPoints(events);

  it('kun skud/mål tages med (ikke andre hændelser)', () => {
    expect(pts.length).toBe(4);
  });
  it('normaliserer så hjemmes skud altid ligger i høj X', () => {
    const home = pts.filter((p) => p.side === 'home');
    expect(home.every((p) => p.x > 50)).toBe(true); // 90 (uændret) + 14→86 (flippet)
  });
  it('modstanderens skud ligger i lav X', () => {
    const away = pts.filter((p) => p.side === 'away');
    expect(away.every((p) => p.x < 50)).toBe(true); // 12 (uændret) + 88→12 (flippet)
  });
  it('markerer mål', () => {
    expect(pts.filter((p) => p.isGoal).length).toBe(1);
  });
  it('tomt/uden koordinater → tom', () => {
    expect(buildShotPoints([])).toEqual([]);
    expect(buildShotPoints([{ type: 12, side: 'home', period: 3 }])).toEqual([]); // ingen x/y
  });
});
