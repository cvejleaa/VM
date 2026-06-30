import { describe, it, expect } from 'vitest';
import { derivedGroupWinners } from './derivedGroupWinners';

// Hjælper: byg de 6 kampe i en 4-holds gruppe.
function groupMatches(groupName, teams, results) {
  const pairs = [
    [teams[0], teams[1]], [teams[2], teams[3]],
    [teams[0], teams[2]], [teams[1], teams[3]],
    [teams[0], teams[3]], [teams[1], teams[2]],
  ];
  return pairs.map(([h, a], i) => ({
    id: `${groupName}_${i}`, round: 'group', groupName, homeTeam: h, awayTeam: a,
    status: results ? 'finished' : 'scheduled',
    result: results ? results[i] : null,
  }));
}

const TEAMS = ['BRA', 'ARG', 'URU', 'PAR'];
// Faktiske resultater hvor BRA vinder alt → BRA bliver etter.
const ACTUAL = [
  { home: 2, away: 0 }, // BRA-ARG
  { home: 1, away: 1 }, // URU-PAR
  { home: 2, away: 0 }, // BRA-URU
  { home: 1, away: 1 }, // ARG-PAR
  { home: 3, away: 0 }, // BRA-PAR
  { home: 1, away: 1 }, // ARG-URU
];

describe('derivedGroupWinners', () => {
  it('udleder en spillers gruppevinder fra deres 6 tips og markerer korrekt', () => {
    const matches = groupMatches('C', TEAMS, ACTUAL);
    // u1 tipper præcis som facit → forudsiger BRA (korrekt).
    // u2 tipper ARG som vinder (ARG vinder alt i deres tips) → forkert.
    const betsByMatch = new Map(matches.map((m, i) => [m.id, [
      { uid: 'u1', home: ACTUAL[i].home, away: ACTUAL[i].away },
      // u2: ARG vinder sine kampe (kamp 0: ARG ude vinder 0-2; kamp 3 ARG hjemme 2-0; kamp 5 ARG 2-0), resten som facit
      { uid: 'u2',
        home: i === 0 ? 0 : i === 3 ? 2 : i === 5 ? 2 : ACTUAL[i].home,
        away: i === 0 ? 2 : i === 3 ? 0 : i === 5 ? 0 : ACTUAL[i].away },
    ]]));

    const out = derivedGroupWinners(matches, betsByMatch);
    expect(out).toHaveLength(1);
    const g = out[0];
    expect(g.groupName).toBe('C');
    expect(g.complete).toBe(true);
    expect(g.actualWinner).toBe('BRA');

    const u1 = g.predictions.find((p) => p.uid === 'u1');
    const u2 = g.predictions.find((p) => p.uid === 'u2');
    expect(u1.winner).toBe('BRA');
    expect(u1.correct).toBe(true);
    expect(u2.winner).toBe('ARG');
    expect(u2.correct).toBe(false);
  });

  it('udelader spillere der ikke har tippet alle 6 kampe', () => {
    const matches = groupMatches('C', TEAMS, ACTUAL);
    // u3 mangler tip på kamp 5.
    const betsByMatch = new Map(matches.map((m, i) => [m.id,
      i === 5 ? [] : [{ uid: 'u3', home: ACTUAL[i].home, away: ACTUAL[i].away }],
    ]));
    const out = derivedGroupWinners(matches, betsByMatch);
    expect(out[0].predictions.find((p) => p.uid === 'u3')).toBeUndefined();
  });

  it('ignorerer ugyldige (ufuldstændige) tips', () => {
    const matches = groupMatches('C', TEAMS, ACTUAL);
    const betsByMatch = new Map(matches.map((m, i) => [m.id, [
      { uid: 'u4', home: i === 2 ? null : ACTUAL[i].home, away: ACTUAL[i].away }, // kamp 2 mangler hjemmemål
    ]]));
    const out = derivedGroupWinners(matches, betsByMatch);
    expect(out[0].predictions.find((p) => p.uid === 'u4')).toBeUndefined();
  });

  it('actualWinner=null og correct=null før gruppen er færdigspillet', () => {
    const matches = groupMatches('C', TEAMS, null); // ingen resultater
    const betsByMatch = new Map(matches.map((m, i) => [m.id, [
      { uid: 'u1', home: ACTUAL[i].home, away: ACTUAL[i].away },
    ]]));
    const out = derivedGroupWinners(matches, betsByMatch);
    expect(out[0].actualWinner).toBeNull();
    expect(out[0].predictions[0].correct).toBeNull();
    expect(out[0].predictions[0].winner).toBe('BRA');
  });

  it('markerer uafgjort i toppen (ambiguous) når tips giver lige top', () => {
    const matches = groupMatches('C', TEAMS, ACTUAL);
    // u5 tipper ALT uafgjort 0-0 → alle hold lige → ambiguous.
    const betsByMatch = new Map(matches.map((m) => [m.id, [{ uid: 'u5', home: 0, away: 0 }]]));
    const out = derivedGroupWinners(matches, betsByMatch);
    const u5 = out[0].predictions.find((p) => p.uid === 'u5');
    expect(u5.ambiguous).toBe(true);
  });

  it('springer grupper uden præcis 6 kampe over', () => {
    const matches = groupMatches('C', TEAMS, ACTUAL).slice(0, 5); // kun 5 kampe
    expect(derivedGroupWinners(matches, new Map())).toEqual([]);
  });
});
