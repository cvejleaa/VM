import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getDataSource, pairKey, selectKnockoutFill, bracketBucket } = require('./fifaSync');

const ms = (iso) => new Date(iso).getTime();

describe('pairKey', () => {
  it('er uordnet (samme nøgle uanset hjemme/ude-rækkefølge)', () => {
    expect(pairKey('MEX', 'RSA')).toBe(pairKey('RSA', 'MEX'));
    expect(pairKey('MEX', 'RSA')).toBe('MEX_RSA');
  });
});

describe('getDataSource', () => {
  const fakeDb = (data) => ({
    collection: () => ({ doc: () => ({ get: async () => ({ data: () => data }) }) }),
  });
  it("returnerer 'fifa' når flaget er sat", async () => {
    expect(await getDataSource(fakeDb({ dataSource: 'fifa' }))).toBe('fifa');
  });
  it("defaulter til 'footballdata'", async () => {
    expect(await getDataSource(fakeDb({}))).toBe('footballdata');
    expect(await getDataSource(fakeDb({ dataSource: 'noget-andet' }))).toBe('footballdata');
  });
  it('falder sikkert tilbage til footballdata ved fejl', async () => {
    const badDb = { collection: () => { throw new Error('boom'); } };
    expect(await getDataSource(badDb)).toBe('footballdata');
  });
});

describe('bracketBucket', () => {
  it('lægger bronze i finale-bucket, resten uændret', () => {
    expect(bracketBucket('bronze')).toBe('final');
    expect(bracketBucket('final')).toBe('final');
    expect(bracketBucket('sf')).toBe('sf');
    expect(bracketBucket('r16')).toBe('r16');
  });
});

describe('selectKnockoutFill', () => {
  // FIFA lumper 3.-pladskampen (18/7) og finalen (19/7) begge under 'final'.
  const fifaKO = [
    { round: 'final', kickoffISO: '2026-07-18T21:00:00Z', homeTeam: 'CRO', awayTeam: 'NED' }, // reelt bronze
    { round: 'final', kickoffISO: '2026-07-19T19:00:00Z', homeTeam: 'ARG', awayTeam: 'FRA' }, // reelt finale
  ];

  it('bronze-slot rammer FIFA-finalekampen med nærmeste kickoff (18/7)', () => {
    const best = selectKnockoutFill({ round: 'bronze', kickoffMs: ms('2026-07-18T21:00:00Z') }, fifaKO);
    expect(best).toMatchObject({ homeTeam: 'CRO', awayTeam: 'NED' });
  });

  it('finale-slot rammer den rigtige finale (19/7), ikke bronzekampen', () => {
    const best = selectKnockoutFill({ round: 'final', kickoffMs: ms('2026-07-19T19:00:00Z') }, fifaKO);
    expect(best).toMatchObject({ homeTeam: 'ARG', awayTeam: 'FRA' });
  });

  it('matcher også når FIFA korrekt mapper 3.-pladsen til bronze', () => {
    const ko = [{ round: 'bronze', kickoffISO: '2026-07-18T21:00:00Z', homeTeam: 'CRO', awayTeam: 'NED' }];
    const best = selectKnockoutFill({ round: 'bronze', kickoffMs: ms('2026-07-18T20:30:00Z') }, ko);
    expect(best).toMatchObject({ homeTeam: 'CRO', awayTeam: 'NED' });
  });

  it('ingen kandidat uden for tidsvinduet (>6t)', () => {
    const best = selectKnockoutFill({ round: 'bronze', kickoffMs: ms('2026-07-10T00:00:00Z') }, fifaKO);
    expect(best).toBeNull();
  });

  it('r16-slot rører ikke finale-bucket', () => {
    const best = selectKnockoutFill({ round: 'r16', kickoffMs: ms('2026-07-18T21:00:00Z') }, fifaKO);
    expect(best).toBeNull();
  });
});
