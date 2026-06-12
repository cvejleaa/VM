// Tests for rene hjælpefunktioner – ingen Firebase-afhængigheder.
import { describe, it, expect } from 'vitest';
import {
  isMatchLocked,
  isTippable,
  groupMatchesByDay,
  dayKey,
  formatKickoffTime,
  roundLabel,
  flagEmoji,
  liveMinuteLabel,
} from './matchHelpers';

// ---------------------------------------------------------------------------
// isTippable
// ---------------------------------------------------------------------------
describe('isTippable', () => {
  const future = new Date(Date.now() + 3600000);
  const past = new Date(Date.now() - 3600000);

  it('er sand for en kommende kamp med kendte hold', () => {
    expect(isTippable({ homeTeam: 'BRA', awayTeam: 'ARG', status: 'scheduled', kickoff: future })).toBe(true);
  });

  it('er falsk når holdene ikke er kendt (knockout der venter)', () => {
    expect(isTippable({ homeTeam: null, awayTeam: null, status: 'pendingTeams', kickoff: future })).toBe(false);
  });

  it('er falsk for status pendingTeams selv med hold', () => {
    expect(isTippable({ homeTeam: 'BRA', awayTeam: 'ARG', status: 'pendingTeams', kickoff: future })).toBe(false);
  });

  it('er falsk når kampen er låst (kickoff passeret)', () => {
    expect(isTippable({ homeTeam: 'BRA', awayTeam: 'ARG', status: 'scheduled', kickoff: past })).toBe(false);
  });

  it('er falsk for null', () => {
    expect(isTippable(null)).toBe(false);
  });
});

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

  it('returnerer false ved undefined kickoff', () => {
    expect(isMatchLocked(undefined)).toBe(false);
  });

  it('håndterer kickoff som millisekunder (number)', () => {
    const ms = new Date('2026-06-15T18:00:00Z').getTime();
    const before = new Date('2026-06-15T17:00:00Z');
    const after = new Date('2026-06-15T19:00:00Z');
    expect(isMatchLocked(ms, before)).toBe(false);
    expect(isMatchLocked(ms, after)).toBe(true);
  });

  it('grænsetilfælde: 1 ms før kickoff er IKKE låst', () => {
    const ko = new Date('2026-06-15T18:00:00.000Z');
    const justBefore = new Date('2026-06-15T17:59:59.999Z');
    expect(isMatchLocked(ko, justBefore)).toBe(false);
  });

  it('grænsetilfælde: 1 ms efter kickoff ER låst', () => {
    const ko = new Date('2026-06-15T18:00:00.000Z');
    const justAfter = new Date('2026-06-15T18:00:00.001Z');
    expect(isMatchLocked(ko, justAfter)).toBe(true);
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

  it('returnerer label som string for hver gruppe', () => {
    const matches = [makeMatch('m1', '2026-06-11T16:00:00Z')];
    const groups = groupMatchesByDay(matches);
    expect(typeof groups[0].label).toBe('string');
    expect(groups[0].label.length).toBeGreaterThan(0);
  });

  it('håndterer Firestore Timestamp-objekter i kickoff', () => {
    const matches = [
      { id: 'ts1', kickoff: { toDate: () => new Date('2026-06-11T16:00:00Z') } },
      { id: 'ts2', kickoff: { toDate: () => new Date('2026-06-11T20:00:00Z') } },
      { id: 'ts3', kickoff: { toDate: () => new Date('2026-06-12T16:00:00Z') } },
    ];
    const groups = groupMatchesByDay(matches);
    expect(groups).toHaveLength(2);
    expect(groups[0].matches).toHaveLength(2);
  });

  it('tre dage giver tre grupper', () => {
    const matches = [
      makeMatch('m1', '2026-06-11T16:00:00Z'),
      makeMatch('m2', '2026-06-12T16:00:00Z'),
      makeMatch('m3', '2026-06-13T16:00:00Z'),
    ];
    const groups = groupMatchesByDay(matches);
    expect(groups).toHaveLength(3);
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

  it('returnerer "Ukendt dato" for undefined', () => {
    expect(dayKey(undefined)).toBe('Ukendt dato');
  });

  it('håndterer Firestore Timestamp (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-11T16:00:00Z') };
    const key = dayKey(ts);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('to kampe på samme dag giver identisk nøgle', () => {
    const k1 = dayKey(new Date('2026-06-11T16:00:00Z'));
    const k2 = dayKey(new Date('2026-06-11T20:00:00Z'));
    expect(k1).toBe(k2);
  });

  it('to kampe på forskellige dage giver forskellige nøgler', () => {
    const k1 = dayKey(new Date('2026-06-11T16:00:00Z'));
    const k2 = dayKey(new Date('2026-06-12T16:00:00Z'));
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// formatKickoffTime
// ---------------------------------------------------------------------------
describe('formatKickoffTime', () => {
  it('returnerer "--:--" for null', () => {
    expect(formatKickoffTime(null)).toBe('--:--');
  });

  it('returnerer "--:--" for undefined', () => {
    expect(formatKickoffTime(undefined)).toBe('--:--');
  });

  it('returnerer en non-tom streng for en dato', () => {
    // 18:00 UTC = 20:00 CEST (sommertid) – dansk locale bruger "." som separator
    const t = formatKickoffTime(new Date('2026-06-15T18:00:00Z'));
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
  });

  it('indeholder "20" for 18:00 UTC sommertid (CEST = UTC+2)', () => {
    // 18:00 UTC = 20:XX i Europa/Copenhagen (CEST)
    const t = formatKickoffTime(new Date('2026-06-15T18:00:00Z'));
    expect(t).toContain('20');
  });

  it('indeholder "18" for 17:00 UTC vintertid (CET = UTC+1)', () => {
    // 17:00 UTC = 18:XX CET (vinter)
    const t = formatKickoffTime(new Date('2026-01-15T17:00:00Z'));
    expect(t).toContain('18');
  });

  it('returnerer korrekt Copenhagen-tid om sommeren (UTC+2)', () => {
    // 18:00 UTC = 20.00 i Europa/Copenhagen (CEST) – dansk locale bruger "."
    const t = formatKickoffTime(new Date('2026-06-15T18:00:00Z'));
    expect(t).toBe('20.00');
  });

  it('returnerer korrekt Copenhagen-tid om vinteren (UTC+1)', () => {
    // 17:00 UTC = 18.00 CET (vinter) – dansk locale bruger "."
    const t = formatKickoffTime(new Date('2026-01-15T17:00:00Z'));
    expect(t).toBe('18.00');
  });

  it('håndterer Firestore Timestamp (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-15T18:00:00Z') };
    const t = formatKickoffTime(ts);
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain('20');
  });
});

// ---------------------------------------------------------------------------
// roundLabel
// ---------------------------------------------------------------------------
describe('roundLabel', () => {
  it('returnerer "Gruppespil" for "group"', () => {
    expect(roundLabel('group')).toBe('Gruppespil');
  });

  it('returnerer "1/16-finale" for "r32"', () => {
    expect(roundLabel('r32')).toBe('1/16-finale');
  });

  it('returnerer "1/8-finale" for "r16"', () => {
    expect(roundLabel('r16')).toBe('1/8-finale');
  });

  it('returnerer "Kvartfinale" for "qf"', () => {
    expect(roundLabel('qf')).toBe('Kvartfinale');
  });

  it('returnerer "Semifinale" for "sf"', () => {
    expect(roundLabel('sf')).toBe('Semifinale');
  });

  it('returnerer "Bronzekamp" for "bronze"', () => {
    expect(roundLabel('bronze')).toBe('Bronzekamp');
  });

  it('returnerer "Finale" for "final"', () => {
    expect(roundLabel('final')).toBe('Finale');
  });

  it('returnerer den ukendte runde-streng som fallback', () => {
    expect(roundLabel('unknown')).toBe('unknown');
  });

  it('returnerer undefined for undefined (ikke crash)', () => {
    expect(roundLabel(undefined)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// flagEmoji
// ---------------------------------------------------------------------------
describe('flagEmoji', () => {
  it('returnerer emoji-flag for "DK"', () => {
    const emoji = flagEmoji('DK');
    // DK = 🇩🇰 – 2 regional indicator symbols
    expect(emoji).toBeTruthy();
    expect(typeof emoji).toBe('string');
    expect(emoji.length).toBeGreaterThan(0);
  });

  it('returnerer emoji-flag for "FR"', () => {
    const emoji = flagEmoji('FR');
    expect(emoji).toBeTruthy();
  });

  it('returnerer 🏳️ for null', () => {
    expect(flagEmoji(null)).toBe('🏳️');
  });

  it('returnerer 🏳️ for undefined', () => {
    expect(flagEmoji(undefined)).toBe('🏳️');
  });

  it('returnerer 🏳️ for tom streng', () => {
    expect(flagEmoji('')).toBe('🏳️');
  });

  it('returnerer 🏳️ for kode med 1 tegn', () => {
    expect(flagEmoji('D')).toBe('🏳️');
  });

  it('returnerer 🏳️ for kode med 3 tegn', () => {
    expect(flagEmoji('DKK')).toBe('🏳️');
  });

  it('fungerer case-insensitivt med stor kode', () => {
    // Bruger toUpperCase i implementeringen
    const upper = flagEmoji('DK');
    const lower = flagEmoji('dk');
    // begge bør returnere noget (dk konverteres til DK internt)
    expect(typeof upper).toBe('string');
    expect(typeof lower).toBe('string');
  });
});

describe('liveMinuteLabel', () => {
  it('1. halvleg med minut', () => {
    expect(liveMinuteLabel({ details: { minute: 43 } })).toBe("1. halvleg · 43'");
  });
  it('2. halvleg med tillægstid', () => {
    expect(liveMinuteLabel({ details: { minute: 90, injuryTime: 3 } })).toBe("2. halvleg · 90+3'");
  });
  it('forlænget tid over 90', () => {
    expect(liveMinuteLabel({ details: { minute: 105 } })).toBe("Forlænget tid · 105'");
  });
  it('falder tilbage til LIVE uden minut', () => {
    expect(liveMinuteLabel({ details: {} })).toBe('LIVE');
    expect(liveMinuteLabel({})).toBe('LIVE');
  });
});
