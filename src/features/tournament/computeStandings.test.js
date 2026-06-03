// ---------------------------------------------------------------------------
// Tests for computeGroupStandings og grupperEfterGruppe.
// Ingen Firebase – rene funktioner med testdata.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  computeGroupStandings,
  grupperEfterGruppe,
} from './computeStandings';

// --- Hjælper til at lave en testkamp ---
function lavKamp(homeTeam, awayTeam, status, hjemmeMål, udeMål, groupName = 'A') {
  return {
    round: 'group',
    groupName,
    homeTeam,
    awayTeam,
    status,
    result:
      status === 'finished' && hjemmeMål != null
        ? { home: hjemmeMål, away: udeMål }
        : null,
    kickoff: '2026-06-11T23:00:00Z',
  };
}

// ─── computeGroupStandings ────────────────────────────────────────────────

describe('computeGroupStandings', () => {
  it('registrerer alle hold fra kampe (også uden resultat)', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null),
    ];
    const stilling = computeGroupStandings(kampe);
    const hold = stilling.map((r) => r.team);
    expect(hold).toContain('ARG');
    expect(hold).toContain('BRA');
  });

  it('kampe uden status finished tæller ikke', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', 2, 0),
      lavKamp('ARG', 'BRA', 'live', 1, 0),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    expect(arg.played).toBe(0);
    expect(arg.points).toBe(0);
  });

  it('kampe med status finished men null result tæller ikke', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', null, null),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    expect(arg.played).toBe(0);
    expect(arg.points).toBe(0);
  });

  it('sejr giver 3 point til vinder og 0 til taber', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 2, 1),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.won).toBe(1);
    expect(arg.points).toBe(3);
    expect(arg.gf).toBe(2);
    expect(arg.ga).toBe(1);

    expect(bra.lost).toBe(1);
    expect(bra.points).toBe(0);
    expect(bra.gf).toBe(1);
    expect(bra.ga).toBe(2);
  });

  it('udesejr giver 3 point til udehold og 0 til hjemmehold', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 0, 3),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(bra.won).toBe(1);
    expect(bra.points).toBe(3);
    expect(arg.lost).toBe(1);
    expect(arg.points).toBe(0);
  });

  it('uafgjort giver 1 point til begge hold', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 1, 1),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.drawn).toBe(1);
    expect(arg.points).toBe(1);
    expect(bra.drawn).toBe(1);
    expect(bra.points).toBe(1);
  });

  it('beregner målforskel korrekt', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 3, 1),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.gd).toBe(2);   // 3 - 1
    expect(bra.gd).toBe(-2);  // 1 - 3
  });

  it('sorterer korrekt: point først, derefter målforskel', () => {
    // ARG: 3+1 = 4 point, gd = +2+0 = +2
    // BRA: 3 point, gd = +1
    // CHI: 0 point
    const kampe = [
      lavKamp('ARG', 'CHI', 'finished', 2, 0),
      lavKamp('ARG', 'BRA', 'finished', 1, 1), // ARG uafgjort med BRA
      lavKamp('BRA', 'CHI', 'finished', 2, 1),
    ];
    const stilling = computeGroupStandings(kampe);

    expect(stilling[0].team).toBe('ARG');  // 4 point, gd=+1
    expect(stilling[1].team).toBe('BRA');  // 4 point – nej: BRA har 3+1=4? Lad os tjekke
    // ARG: vandt CHI (+3pt), uafgjort BRA (+1pt) = 4pt, gf=3, ga=1, gd=+2
    // BRA: uafgjort ARG (+1pt), vandt CHI (+3pt) = 4pt, gf=3, ga=2, gd=+1
    // CHI: 0pt
    // Sortering: ARG og BRA begge 4pt → gd: ARG +2 > BRA +1 → ARG først
    expect(stilling[0].team).toBe('ARG');
    expect(stilling[1].team).toBe('BRA');
    expect(stilling[2].team).toBe('CHI');
  });

  it('bruger scorede mål som tiebreak når point og målforskel er ens', () => {
    // ARG og BRA: begge 3 point, gd = +2, men ARG scorede 4, BRA scorede 2
    const kampe = [
      lavKamp('ARG', 'CHI', 'finished', 4, 2),  // ARG vinder 4-2 (gd +2, gf 4)
      lavKamp('BRA', 'PER', 'finished', 2, 0),   // BRA vinder 2-0 (gd +2, gf 2)
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const bra = stilling.find((r) => r.team === 'BRA');

    expect(arg.points).toBe(3);
    expect(bra.points).toBe(3);
    expect(arg.gd).toBe(2);
    expect(bra.gd).toBe(2);
    expect(arg.gf).toBe(4);
    expect(bra.gf).toBe(2);

    // ARG bør stå over BRA (flere scorede mål)
    const argIdx = stilling.indexOf(arg);
    const braIdx = stilling.indexOf(bra);
    expect(argIdx).toBeLessThan(braIdx);
  });

  it('bruger landenavn som endelig tiebreak', () => {
    // ARG (Argentina) og GER (Tyskland) – begge 3pt, gd=+2, gf=2
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 2, 0),
      lavKamp('GER', 'FRA', 'finished', 2, 0),
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');
    const ger = stilling.find((r) => r.team === 'GER');

    // Argentina < Tyskland alfabetisk → ARG bør stå øverst
    const argIdx = stilling.indexOf(arg);
    const gerIdx = stilling.indexOf(ger);
    expect(argIdx).toBeLessThan(gerIdx);
  });

  it('akkumulerer stats korrekt over flere kampe', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'finished', 2, 1), // ARG vinder
      lavKamp('ARG', 'CHI', 'finished', 1, 0), // ARG vinder
      lavKamp('BRA', 'CHI', 'finished', 0, 0), // uafgjort
    ];
    const stilling = computeGroupStandings(kampe);
    const arg = stilling.find((r) => r.team === 'ARG');

    expect(arg.played).toBe(2);
    expect(arg.won).toBe(2);
    expect(arg.drawn).toBe(0);
    expect(arg.lost).toBe(0);
    expect(arg.gf).toBe(3);
    expect(arg.ga).toBe(1);
    expect(arg.gd).toBe(2);
    expect(arg.points).toBe(6);
  });
});

// ─── grupperEfterGruppe ───────────────────────────────────────────────────

describe('grupperEfterGruppe', () => {
  it('ignorerer ikke-gruppe-kampe', () => {
    const kampe = [
      { round: 'r32', groupName: null, homeTeam: 'ARG', awayTeam: 'BRA', status: 'pendingTeams', result: null },
      { round: 'group', groupName: 'A', homeTeam: 'MEX', awayTeam: 'USA', status: 'scheduled', result: null },
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.size).toBe(1);
    expect(gruppeMap.has('A')).toBe(true);
  });

  it('samler kampe under korrekt gruppenavn', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null, 'B'),
      lavKamp('PER', 'CHI', 'scheduled', null, null, 'B'),
      lavKamp('MEX', 'USA', 'scheduled', null, null, 'A'),
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    expect(gruppeMap.get('B')).toHaveLength(2);
    expect(gruppeMap.get('A')).toHaveLength(1);
  });

  it('sorterer grupper alfabetisk (A, B, C ...)', () => {
    const kampe = [
      lavKamp('ARG', 'BRA', 'scheduled', null, null, 'C'),
      lavKamp('MEX', 'USA', 'scheduled', null, null, 'A'),
      lavKamp('GER', 'FRA', 'scheduled', null, null, 'B'),
    ];
    const gruppeMap = grupperEfterGruppe(kampe);
    const nøgler = [...gruppeMap.keys()];
    expect(nøgler).toEqual(['A', 'B', 'C']);
  });
});
