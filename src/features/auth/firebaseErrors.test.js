// Tests for fejloversættelsesfunktionen – kræver ingen Firebase-forbindelse.
import { describe, it, expect } from 'vitest';
import { translateFirebaseError, getAuthErrorMessage } from './firebaseErrors';

describe('translateFirebaseError', () => {
  it('oversætter auth/invalid-credential', () => {
    const msg = translateFirebaseError('auth/invalid-credential');
    expect(msg).toContain('adgangskode');
  });

  it('oversætter auth/email-already-in-use', () => {
    const msg = translateFirebaseError('auth/email-already-in-use');
    expect(msg).toContain('brug');
  });

  it('oversætter auth/weak-password', () => {
    const msg = translateFirebaseError('auth/weak-password');
    expect(msg).toContain('svag');
  });

  it('oversætter auth/user-not-found', () => {
    const msg = translateFirebaseError('auth/user-not-found');
    expect(msg).toContain('bruger');
  });

  it('returnerer fallback for ukendt kode', () => {
    const msg = translateFirebaseError('auth/some-unknown-code');
    expect(msg).toContain('ukendt');
  });

  it('håndterer tom streng', () => {
    const msg = translateFirebaseError('');
    expect(msg).toBeTruthy();
  });
});

describe('getAuthErrorMessage', () => {
  it('udtrækker fejlkode fra error-objekt', () => {
    const err = { code: 'auth/invalid-credential' };
    const msg = getAuthErrorMessage(err);
    expect(msg).toContain('adgangskode');
  });

  it('returnerer fallback for objekt uden kode', () => {
    const msg = getAuthErrorMessage({});
    expect(msg).toBeTruthy();
  });

  it('returnerer fallback for null', () => {
    const msg = getAuthErrorMessage(null);
    expect(msg).toBeTruthy();
  });
});
