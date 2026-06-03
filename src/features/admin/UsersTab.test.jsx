// Tests for UsersTab — rollebaseret synlighed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn((q, cb) => {
    // Simuler tomt snapshot
    cb({ docs: [] });
    return vi.fn(); // unsubscribe
  }),
  orderBy: vi.fn(),
  query: vi.fn(),
}));

import UsersTab from './UsersTab';

describe('UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderes uden fejl for owner', () => {
    render(<UsersTab isOwner={true} />);
    // Viser liste eller "ingen brugere"-besked
    expect(
      screen.getByText(/Ingen brugere/i) || screen.getByRole('list')
    ).toBeTruthy();
  });

  it('returnerer null for ikke-owner', () => {
    const { container } = render(<UsersTab isOwner={false} />);
    // Komponenten returner null — containeren er tom
    expect(container.firstChild).toBeNull();
  });
});
