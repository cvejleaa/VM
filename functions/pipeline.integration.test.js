// ---------------------------------------------------------------------------
// pipeline.integration.test.js — end-to-end-test af resultat-kæden uden
// Firebase/emulator. Følger en realistisk football-data.org-payload hele vejen:
//   football-data → decideUpdate → patch → scoreMatch/scoreKnockout → point
//   færdigspillet gruppe → computeGroupStandings → resolveGroupWinners → bonus
// Formålet er at fange brud i sammenhængen mellem modulerne før turneringen.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { decideUpdate, healedKnockoutResult } = require('./resultsSync');
const { scoreMatch, scoreKnockout, bonusPoints, POINTS } = require('./scoring');
const { computeGroupStandings } = require('./standings');
const { resolveGroupWinners } = require('./bonusResolve');
const { mapMatchDetails, knockoutNinetyResult } = require('./footballData');

const NOW = new Date('2026-06-25T21:00:00Z');

// Et football-data v4-match (forenklet, men med de felter koden læser).
const fd = (homeTla, awayTla, h, a, { status = 'FINISHED', winner, duration } = {}) => ({
  status,
  utcDate: '2026-06-25T19:00:00Z',
  homeTeam: { tla: homeTla, name: homeTla },
  awayTeam: { tla: awayTla, name: awayTla },
  score: { winner, duration, fullTime: { home: h, away: a } },
});

describe('resultat-kæden: gruppekamp → point', () => {
  const our = { round: 'group', groupName: 'C', homeTeam: 'BRA', awayTeam: 'MAR', status: 'scheduled' };

  it('en afsluttet kamp giver det rigtige resultat og point til spillerne', () => {
    const decision = decideUpdate(our, fd('BRA', 'MAR', 2, 0, { winner: 'HOME_TEAM' }), NOW);
    expect(decision.action).toBe('finish');
    expect(decision.patch.status).toBe('finished');
    expect(decision.patch.result).toEqual({ home: 2, away: 0 });

    const result = decision.patch.result;
    // Eksakt tip → 5, rigtigt udfald + målforskel → 3, rigtigt udfald men
    // forkert målforskel → 2, forkert udfald → 0.
    expect(scoreMatch({ home: 2, away: 0 }, result)).toBe(POINTS.EXACT);
    expect(scoreMatch({ home: 3, away: 1 }, result)).toBe(POINTS.GOAL_DIFF);
    expect(scoreMatch({ home: 3, away: 0 }, result)).toBe(POINTS.OUTCOME);
    expect(scoreMatch({ home: 0, away: 1 }, result)).toBe(POINTS.WRONG);
  });

  it('live-kamp giver foreløbig score uden at afslutte', () => {
    const decision = decideUpdate(our, fd('BRA', 'MAR', 1, 0, { status: 'IN_PLAY' }), NOW);
    expect(decision.action).toBe('live');
    expect(decision.patch.status).toBe('live');
    expect(decision.patch.result).toEqual({ home: 1, away: 0 });
  });
});

describe('resultat-kæden: knockout på straffespark', () => {
  const our = { round: 'qf', homeTeam: 'ESP', awayTeam: 'FRA', status: 'scheduled' };

  it('uafgjort fuldtid + winner → advance, og advance-bonus til den der ramte', () => {
    const decision = decideUpdate(
      our,
      fd('ESP', 'FRA', 1, 1, { winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT' }),
      NOW,
    );
    expect(decision.action).toBe('finish');
    expect(decision.patch.needsReview).toBeUndefined();
    expect(decision.patch.result).toEqual({ home: 1, away: 1, advance: 'FRA' });

    const result = decision.patch.result;
    // Ramte uafgjort 1-1 OG at FRA gik videre → eksakt (5) + advance (2).
    expect(scoreKnockout({ home: 1, away: 1, advance: 'FRA' }, result)).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
    // Ramte scoren men forkert «videre» → kun score-point.
    expect(scoreKnockout({ home: 1, away: 1, advance: 'ESP' }, result)).toBe(POINTS.EXACT);
  });
});

describe('resultat-kæden: knockout-straffe med RIGTIG football-data-form (regression NED–MAR)', () => {
  // Den FAKTISKE form football-data leverede for Holland–Marokko (1/16):
  //   - kampen sluttede 1-1 efter 90 min (+ tillægstid), straffe 2-3 → Marokko videre
  //   - score.fullTime = 3-4 (INKLUDERER straffene!), score.regularTime = 1-1
  //   - mål-tidslinjen: Gakpo (NED) 72', Diop (MAR) 90+1'
  // Det var præcis denne form (fullTime ≠ 90-min) der fik kampen gemt som et oppustet
  // resultat. Denne test fastholder at HELE kæden ender på 90-min-resultatet 1-1.
  const NED = { id: 10, tla: 'NED', name: 'Netherlands' };
  const MAR = { id: 20, tla: 'MAR', name: 'Morocco' };
  const rawDetail = {
    match: {
      status: 'FINISHED',
      homeTeam: NED,
      awayTeam: MAR,
      score: {
        winner: 'AWAY_TEAM',
        duration: 'PENALTY_SHOOTOUT',
        halfTime: { home: 0, away: 0 },
        regularTime: { home: 1, away: 1 },
        fullTime: { home: 3, away: 4 }, // ← inkl. straffe (fælden)
        extraTime: { home: 0, away: 0 },
        penalties: { home: 2, away: 3 },
      },
      goals: [
        { minute: 72, injuryTime: null, type: 'REGULAR', team: NED, scorer: { name: 'Gakpo' } },
        { minute: 90, injuryTime: 1, type: 'REGULAR', team: MAR, scorer: { name: 'Diop' } },
      ],
    },
  };
  const score = rawDetail.match.score;

  it('90-min udledes til 1-1 (fullTime/straffe tæller IKKE)', () => {
    const details = mapMatchDetails(rawDetail);
    expect(knockoutNinetyResult(score, details.goals)).toEqual({ home: 1, away: 1 });
    // Kontrast: fullTime ville have givet det forkerte 3-4.
    expect(score.fullTime).toEqual({ home: 3, away: 4 });
  });

  it('selvhelbredelsen retter et oppustet gemt resultat til 90-min + videre (uden API)', () => {
    const details = mapMatchDetails(rawDetail);
    // Sådan som kampen fejlagtigt lå gemt (fra fullTime):
    const stored = {
      round: 'r32', homeTeam: 'NED', awayTeam: 'MAR', status: 'finished',
      result: { home: 4, away: 4, advance: 'MAR' },
      details, // mål + straffe gemt af detalje-synken
    };
    expect(healedKnockoutResult(stored)).toEqual({ home: 1, away: 1, advance: 'MAR' });
  });

  it('point er korrekte efter rettelse', () => {
    const result = { home: 1, away: 1, advance: 'MAR' };
    // Eksakt 1-1 + tippet NED videre (forkert) → 5 (ingen advance-bonus).
    expect(scoreKnockout({ home: 1, away: 1, advance: 'NED' }, result)).toBe(POINTS.EXACT);
    // Tippet 1-2 men MAR videre (rigtigt) → forkert udfald (0) + advance (2).
    expect(scoreKnockout({ home: 1, away: 2, advance: 'MAR' }, result)).toBe(POINTS.KNOCKOUT_ADVANCE);
    // Et oppustet 4-4 ville fejlagtigt have givet et 1-1-tip 3 (målforskel) i stedet for 5.
    expect(scoreKnockout({ home: 1, away: 1, advance: 'NED' }, { home: 4, away: 4, advance: 'MAR' })).toBe(POINTS.GOAL_DIFF);
  });
});

describe('resultat-kæden: færdigspillet gruppe → gruppevinder-bonus', () => {
  const teams = ['BRA', 'MAR', 'HAI', 'SCO'];

  // 6 finished kampe hvor BRA vinder alt, resten uafgjort → BRA bliver etter.
  const matches = (() => {
    const pairs = [['BRA', 'MAR'], ['HAI', 'SCO'], ['BRA', 'HAI'], ['MAR', 'SCO'], ['BRA', 'SCO'], ['MAR', 'HAI']];
    return pairs.map(([h, a]) => ({
      groupName: 'C', round: 'group', status: 'finished', homeTeam: h, awayTeam: a,
      result: h === 'BRA' ? { home: 2, away: 0 } : { home: 1, away: 1 },
    }));
  })();

  it('rangerer korrekt og afgør vinderen som facit', () => {
    const standings = computeGroupStandings(teams, matches);
    expect(standings[0].team).toBe('BRA');

    const q = { id: 'groupWinner_C', type: 'groupWinner', groupName: 'C', facit: null, options: teams };
    const resolutions = resolveGroupWinners([q], matches);
    expect(resolutions).toEqual([{ questionId: 'groupWinner_C', groupName: 'C', facit: 'BRA' }]);

    // Bonus-point: rigtigt gæt (BRA) → 10, forkert (MAR) → 0.
    const facit = resolutions[0].facit;
    expect(bonusPoints({ answer: 'BRA', facit, type: 'groupWinner' })).toBe(POINTS.BONUS);
    expect(bonusPoints({ answer: 'MAR', facit, type: 'groupWinner' })).toBe(0);
  });

  it('afgør ikke gruppevinderen før alle kampe er spillet', () => {
    const q = { id: 'groupWinner_C', type: 'groupWinner', groupName: 'C', facit: null, options: teams };
    expect(resolveGroupWinners([q], matches.slice(0, 5))).toEqual([]);
  });
});
