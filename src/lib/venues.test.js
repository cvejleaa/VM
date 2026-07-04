import { describe, it, expect } from 'vitest';
import { venueCity, venueLabel } from './venues';

describe('venueCity', () => {
  it('slår by op for kendte VM 2026-stadioner', () => {
    expect(venueCity('MetLife Stadium')).toBe('New York/New Jersey');
    expect(venueCity('SoFi Stadium')).toBe('Los Angeles');
    expect(venueCity('AT&T Stadium')).toBe('Dallas');
    expect(venueCity('NRG Stadium')).toBe('Houston');
    expect(venueCity('Gillette Stadium')).toBe('Boston');
    expect(venueCity('Hard Rock Stadium')).toBe('Miami');
    expect(venueCity('BC Place')).toBe('Vancouver');
    expect(venueCity('BMO Field')).toBe('Toronto');
  });

  it('matcher tolerant på navnevarianter (Azteca / Estadio Azteca)', () => {
    expect(venueCity('Azteca')).toBe('Mexico City');
    expect(venueCity('Estadio Azteca')).toBe('Mexico City');
    expect(venueCity('METLIFE STADIUM')).toBe('New York/New Jersey');
  });

  it('null for ukendt eller tomt stadion', () => {
    expect(venueCity('Ukendt Arena')).toBeNull();
    expect(venueCity('')).toBeNull();
    expect(venueCity(null)).toBeNull();
    expect(venueCity(undefined)).toBeNull();
  });
});

describe('venueLabel', () => {
  it('"Stadion, By" når byen kendes', () => {
    expect(venueLabel('MetLife Stadium')).toBe('MetLife Stadium, New York/New Jersey');
    expect(venueLabel('Azteca')).toBe('Azteca, Mexico City');
  });
  it('bare stadionnavnet når byen ikke kendes', () => {
    expect(venueLabel('Ukendt Arena')).toBe('Ukendt Arena');
  });
  it('null når der intet stadion er', () => {
    expect(venueLabel(null)).toBeNull();
    expect(venueLabel('')).toBeNull();
  });
});
