// Tests for rene hjælpefunktioner – ingen Firebase-afhængigheder.
import { describe, it, expect } from 'vitest';
import { isMatchLocked, groupMatchesByDay, dayKey } from './matchHelpers';

// ---------------------------------------------------------------------------
// isMatchLocked
// ---------------------------------------------------------------------------
describe('isMatchLocked', () => {
  const kickoff = new Date('2026-06-15T18:00:00Z'); // fast tidspunkt

  it('returnerer false hvis nu er FØR kickoff', () => {
    const before = new Date('2026-06-15T17:59:59Z');
    expect(isMatchLocked(kickoff, before)).toBe(false);
  });

  it('returnerer true hvis nu er EFTER kickoff', () => {
    const after = new Date('2026-06-15T18:00:01Z');
    expect(isMatchLocked(kickoff, after)).toBe(true);
  });

  it('returnerer true præcis ved kickoff-tidspunktet', () => {
    expect(isMatchLocked(kickoff, kickoff)).toBe(true);
  });

  it('håndterer Firestore Timestamp-lignende objekt (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-20T20:00:00Z') };
    const before = new Date('2026-06-20T19:59:00Z');
    const after = new Date('2026-06-20T20:01:00Z');
    expect(isMatchLocked(ts, before)).toBe(false);
    expect(isMatchLocked(ts, after)).toBe(true);
  });

  it('returnerer false ved null kickoff', () => {
    expect(isMatchLocked(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// groupMatchesByDay
// ---------------------------------------------------------------------------
describe('groupMatchesByDay', () => {
  const makeMatch = (id, isoDate) => ({ id, kickoff: new Date(isoDate) });

  it('grupperer kampe på samme dag korrekt', () => {
    const matches = [
      makeMatch('m1', '2026-06-11T16:00:00Z'),
      makeMatch('m2', '2026-06-11T19:00:00Z'),
      makeMatch('m3', '2026-06-12T16:00:00Z'),
    ];
    const groups = groupMatchesByDay(matches);
    expect(groups).toHaveLength(2);
    expect(groups[0].matches).toHaveLength(2);
    expect(groups[1].matches).toHaveLength(1);
  });

  it('returnerer tom liste for tomt input', () => {
    expect(groupMatchesByDay([])).toEqual([]);
  });

  it('returnerer én gruppe for en enkelt kamp', () => {
    const matches = [makeMatch('m1', '2026-06-14T18:00:00Z')];
    const groups = groupMatchesByDay(matches);
    expect(groups).toHaveLength(1);
    expect(groups[0].matches[0].id).toBe('m1');
  });

  it('sorterer grupper kronologisk', () => {
    const matches = [
      makeMatch('m3', '2026-06-13T18:00:00Z'),
      makeMatch('m1', '2026-06-11T16:00:00Z'),
      makeMatch('m2', '2026-06-12T16:00:00Z'),
    ];
    const groups = groupMatchesByDay(matches);
    // Første gruppe skal have tidligste dato
    const firstTs = groups[0]._ts;
    const lastTs = groups[groups.length - 1]._ts;
    expect(new Date(firstTs) < new Date(lastTs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dayKey – kontrollerer at funktionen returnerer en streng (formattering varierer med locale)
// ---------------------------------------------------------------------------
describe('dayKey', () => {
  it('returnerer en non-tom streng for en dato', () => {
    const key = dayKey(new Date('2026-06-11T16:00:00Z'));
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('returnerer "Ukendt dato" for null', () => {
    expect(dayKey(null)).toBe('Ukendt dato');
  });
});
