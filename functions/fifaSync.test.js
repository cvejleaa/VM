import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getDataSource, pairKey } = require('./fifaSync');

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
