// Tests for AdminPage — rollebaseret fanegentlighed.
// Bekræfter at Brugere-fanen er skjult for matchAdmin og synlig for owner.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
  functions: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()), // returnerer unsubscribe-funktion
  orderBy: vi.fn(),
  query: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: {
    fromDate: vi.fn((d) => ({ toDate: () => d })),
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import AdminPage from './AdminPage';

function renderAdminPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

describe('AdminPage — rollebaseret fanestyring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Owner-bruger', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isOwner: true,
        isMatchAdmin: true,
        user: { uid: 'owner-uid' },
        profile: { displayName: 'Ejer' },
      });
    });

    it('viser Brugere-fanen for owner', () => {
      renderAdminPage();
      // Fane-knappen med teksten "Brugere" skal være synlig
      const brugereTab = screen.queryByTestId('tab-users');
      expect(brugereTab).toBeInTheDocument();
    });

    it('viser Kampe & resultater-fanen for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-matches')).toBeInTheDocument();
    });

    it('viser Bonus-facit-fanen for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-bonus')).toBeInTheDocument();
    });

    it('viser alle tre faner for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-users')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-matches')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-bonus')).toBeInTheDocument();
    });

    it('viser tekst om fuld adgang som ejer', () => {
      renderAdminPage();
      expect(screen.getByText(/fuld adgang som ejer/i)).toBeInTheDocument();
    });
  });

  describe('MatchAdmin-bruger (ikke owner)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isOwner: false,
        isMatchAdmin: true,
        user: { uid: 'matchadmin-uid' },
        profile: { displayName: 'Kamp Admin' },
      });
    });

    it('SKJULER Brugere-fanen for matchAdmin', () => {
      renderAdminPage();
      // data-testid="tab-users" må IKKE eksistere for matchAdmin
      expect(screen.queryByTestId('tab-users')).not.toBeInTheDocument();
    });

    it('viser Kampe & resultater-fanen for matchAdmin', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-matches')).toBeInTheDocument();
    });

    it('viser Bonus-facit-fanen for matchAdmin', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-bonus')).toBeInTheDocument();
    });

    it('viser kun ikke-bruger-faner for matchAdmin (Kampe, Bonus, Ligaer)', () => {
      renderAdminPage();
      const tabs = screen.queryAllByTestId(/^tab-/);
      expect(tabs).toHaveLength(3); // matches, bonus, leagues — ikke 'users'
      expect(screen.queryByTestId('tab-users')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-leagues')).toBeInTheDocument();
    });

    it('viser tekst om kamp-administrator adgang', () => {
      renderAdminPage();
      expect(screen.getByText(/kamp-administrator/i)).toBeInTheDocument();
    });
  });
});
