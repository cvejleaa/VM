import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { decideFifaUpdate } = require('./fifaResultsSync');
const { mapCalendarMatch } = require('./fifaMap');

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(dir, '__fixtures__', 'fifa', f), 'utf8'));
const calendar = fx('calendar-sample.json').Results;
const tlPenalties = fx('timeline-penalties.json'); // 0-0 → straffe 4-3
const KOV = 2;

// Byg mappede FIFA-kampe fra fixtures, slå op på holdpar.
const mapped = {};
for (const raw of calendar) {
  const m = mapCalendarMatch(raw);
  if (m.homeTeam && m.awayTeam) mapped[`${m.homeTeam}_${m.awayTeam}`] = m;
}

describe('decideFifaUpdate', () => {
  it('ikke-startet kamp → skip', () => {
    const fm = { status: 'scheduled' };
    expect(decideFifaUpdate({ round: 'group' }, fm).action).toBe('skip');
    const fmp = { status: 'pendingTeams' };
    expect(decideFifaUpdate({ round: 'r32' }, fmp).action).toBe('skip');
  });

  it('manuelt låst kamp → skip', () => {
    const fm = mapped['MEX_ECU'];
    expect(decideFifaUpdate({ round: 'r32', manualLock: true }, fm).action).toBe('skip');
  });

  it('afsluttet GRUPPEkamp → finish uden koSyncVersion', () => {
    // Syntetisk gruppekamp (fuldtid = resultat).
    const fm = mapCalendarMatch({
      IdMatch: '1', IdGroup: '9', StageName: [{ Locale: 'en', Description: 'First stage' }],
      GroupName: [{ Locale: 'en', Description: 'Group A' }], Date: '2026-06-11T19:00:00Z',
      MatchStatus: 0, ResultType: 1, HomeTeamScore: 2, AwayTeamScore: 1,
      HomeTeamPenaltyScore: null, AwayTeamPenaltyScore: null, Winner: '100',
      Home: { IdCountry: 'MEX', IdTeam: '100' }, Away: { IdCountry: 'RSA', IdTeam: '200' },
      Stadium: null, PlaceHolderA: null, PlaceHolderB: null,
    });
    const res = decideFifaUpdate({ round: 'group', status: 'scheduled', homeTeam: 'MEX', awayTeam: 'RSA' }, fm, null, { koSyncVersion: KOV });
    expect(res.action).toBe('finish');
    expect(res.patch).toMatchObject({ result: { home: 2, away: 1 }, status: 'finished', resultSource: 'auto' });
    expect(res.patch.koSyncVersion).toBeUndefined();
  });

  it('afsluttet KNOCKOUT i ordinær tid → finish med advance + koSyncVersion', () => {
    const fm = mapped['MEX_ECU']; // r32, 2-0, advance MEX
    const res = decideFifaUpdate({ round: 'r32', status: 'scheduled', homeTeam: 'MEX', awayTeam: 'ECU' }, fm, null, { koSyncVersion: KOV });
    expect(res.action).toBe('finish');
    expect(res.patch.result).toMatchObject({ home: 2, away: 0, advance: 'MEX' });
    expect(res.patch.koSyncVersion).toBe(KOV);
  });

  it('afsluttet KNOCKOUT på straffe → 90-min (0-0) fra tidslinje + videre til straffevinder', () => {
    const fm = { status: 'finished', round: 'r16', resultType: 'penalties', homeTeam: 'SUI', awayTeam: 'COL',
      result: { home: 0, away: 0, penalties: { home: 4, away: 3 } } };
    const res = decideFifaUpdate({ round: 'r16', status: 'scheduled', homeTeam: 'SUI', awayTeam: 'COL' }, fm, tlPenalties, { koSyncVersion: KOV });
    expect(res.action).toBe('finish');
    expect(res.patch.result).toEqual({ home: 0, away: 0, advance: 'SUI' });
    expect(res.patch.koSyncVersion).toBe(KOV);
  });

  it('knockout på ET/straffe UDEN tidslinje → review (aldrig scoring på oppustet fuldtid)', () => {
    const fm = { status: 'finished', round: 'r16', resultType: 'penalties', homeTeam: 'SUI', awayTeam: 'COL',
      result: { home: 0, away: 0 } };
    const res = decideFifaUpdate({ round: 'r16', status: 'scheduled', homeTeam: 'SUI', awayTeam: 'COL' }, fm, null, { koSyncVersion: KOV });
    expect(res.action).toBe('review');
    expect(res.patch.needsReview).toBe(true);
  });

  it('knockout allerede afsluttet hos os → skip (bevar vores 90-min)', () => {
    const fm = mapped['MEX_ECU'];
    const res = decideFifaUpdate({ round: 'r32', status: 'finished', homeTeam: 'MEX', awayTeam: 'ECU' }, fm);
    expect(res.action).toBe('skip');
    expect(res.reason).toBe('knockout-finished');
  });

  it('vender resultatet til vores orientering hvis hjemme/ude er byttet om', () => {
    const fm = mapped['MEX_ECU']; // FIFA: MEX(h) 2 - ECU(a) 0
    // Hos os er kampen gemt omvendt: ECU hjemme, MEX ude.
    const res = decideFifaUpdate({ round: 'r32', status: 'scheduled', homeTeam: 'ECU', awayTeam: 'MEX' }, fm, null, { koSyncVersion: KOV });
    expect(res.patch.result).toMatchObject({ home: 0, away: 2, advance: 'MEX' });
  });

  it('SIKKERHEDSVÆRN: "afsluttet" kort efter kickoff → behandles som live (ingen for tidlig scoring)', () => {
    const now = new Date('2026-07-09T21:00:00Z');
    const fm = { status: 'finished', round: 'group', resultType: 'regular',
      homeTeam: 'FRA', awayTeam: 'MAR', homeScore: 1, awayScore: 0, result: { home: 1, away: 0 } };
    const ourMatch = { round: 'group', status: 'scheduled', homeTeam: 'FRA', awayTeam: 'MAR', kickoff: '2026-07-09T20:30:00Z' }; // 30 min siden
    const res = decideFifaUpdate(ourMatch, fm, null, { now });
    expect(res.action).toBe('live');
    expect(res.patch.status).toBe('live');
    expect(res.patch.result).toMatchObject({ home: 1, away: 0 });
  });

  it('afsluttet kamp længe efter kickoff → afsluttes normalt', () => {
    const now = new Date('2026-07-09T23:00:00Z');
    const fm = { status: 'finished', round: 'group', resultType: 'regular',
      homeTeam: 'FRA', awayTeam: 'MAR', homeScore: 2, awayScore: 1, result: { home: 2, away: 1 } };
    const ourMatch = { round: 'group', status: 'scheduled', homeTeam: 'FRA', awayTeam: 'MAR', kickoff: '2026-07-09T20:30:00Z' }; // 150 min siden
    const res = decideFifaUpdate(ourMatch, fm, null, { now });
    expect(res.action).toBe('finish');
    expect(res.patch.result).toMatchObject({ home: 2, away: 1 });
  });

  it('live kamp → foreløbig live-score', () => {
    const fm = { status: 'live', homeScore: 1, awayScore: 0, homeTeam: 'BRA', awayTeam: 'NOR' };
    const res = decideFifaUpdate({ round: 'r16', status: 'scheduled', homeTeam: 'BRA', awayTeam: 'NOR' }, fm);
    expect(res.action).toBe('live');
    expect(res.patch).toMatchObject({ result: { home: 1, away: 0 }, status: 'live', resultSource: 'auto' });
  });
});
