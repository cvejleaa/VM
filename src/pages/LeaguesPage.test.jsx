/**
 * Tests for LeaguesPage.
 * Mocker alle Firebase-hooks og context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeaguesPage from './LeaguesPage';

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'me-uid' },
    profile: { displayName: 'Mig' },
  }),
}));

// ── Basis standings til tests ─────────────────────────────────────────────────
const mockStandings = [
  { uid: 'uid-1', displayName: 'Alice', totalPoints: 50 },
  { uid: 'me-uid', displayName: 'Mig', totalPoints: 30 },
  { uid: 'uid-3', displayName: 'Charlie', totalPoints: 10 },
];

vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: mockStandings, loading: false, error: null }),
}));

// ── Ligaer ─────────────────────────────────────────────────────────────────────
const mockLeagues = [
  {
    id: 'league-1',
    name: 'Testliga',
    ownerUid: 'me-uid',
    joinCode: 'ABC123',
    memberUids: ['me-uid', 'uid-1'],
  },
];

let leaguesData = mockLeagues;

vi.mock('../features/leagues/useLeagues', () => ({
  useLeagues: () => ({
    leagues: leaguesData,
    loading: false,
    error: null,
  }),
}));

// ── Mock league actions ───────────────────────────────────────────────────────
vi.mock('../features/leagues/leagueActions', () => ({
  createLeague: vi.fn().mockResolvedValue('new-league-id'),
  joinLeague: vi.fn().mockResolvedValue({ id: 'other-league', name: 'AndenLiga' }),
  leaveLeague: vi.fn().mockResolvedValue(undefined),
  deleteLeague: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
}));

// window.confirm mock
global.confirm = vi.fn(() => true);

describe('LeaguesPage – listevisning', () => {
  beforeEach(() => {
    leaguesData = mockLeagues;
  });

  it('viser brugerens ligaer', () => {
    render(<LeaguesPage />);
    expect(screen.getByText('Testliga')).toBeInTheDocument();
  });

  it('viser antal medlemmer på ligakortet', () => {
    render(<LeaguesPage />);
    // 2 spillere i ligaen – badge med "2 👤"
    const badge = screen.getByText(/👤/);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('2');
  });

  it('viser "ejer"-badge for brugerens egne ligaer', () => {
    render(<LeaguesPage />);
    expect(screen.getByText('ejer')).toBeInTheDocument();
  });

  it('viser tom-tilstand når ingen ligaer', () => {
    leaguesData = [];
    render(<LeaguesPage />);
    expect(screen.getByText(/ikke med i nogen liga/i)).toBeInTheDocument();
  });

  it('viser "Opret liga"-formular ved klik', async () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('+ Opret liga'));
    expect(screen.getByText('Opret ny liga')).toBeInTheDocument();
    expect(screen.getByLabelText(/ligaens navn/i)).toBeInTheDocument();
  });

  it('viser "Tilmeld via kode"-formular ved klik', async () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('Tilmeld via kode'));
    expect(screen.getByText('Tilmeld via kode', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByLabelText(/kode/i)).toBeInTheDocument();
  });
});

describe('LeaguesPage – opret liga', () => {
  it('kalder createLeague med korrekte argumenter ved submit', async () => {
    const { createLeague } = await import('../features/leagues/leagueActions');
    render(<LeaguesPage />);

    fireEvent.click(screen.getByText('+ Opret liga'));
    const input = screen.getByLabelText(/ligaens navn/i);
    fireEvent.change(input, { target: { value: 'Min Liga' } });
    fireEvent.click(screen.getByText('Opret liga'));

    await waitFor(() => {
      expect(createLeague).toHaveBeenCalledWith('Min Liga', 'me-uid');
    });
  });
});

describe('LeaguesPage – join via kode', () => {
  it('kalder joinLeague med korrekte argumenter ved submit', async () => {
    const { joinLeague } = await import('../features/leagues/leagueActions');
    render(<LeaguesPage />);

    fireEvent.click(screen.getByText('Tilmeld via kode'));
    const input = screen.getByLabelText(/kode/i);
    fireEvent.change(input, { target: { value: 'XYZ789' } });
    fireEvent.click(screen.getByText('Tilmeld via kode', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(joinLeague).toHaveBeenCalledWith('XYZ789', 'me-uid');
    });
  });
});

describe('LeaguesPage – detaljevisning', () => {
  beforeEach(() => {
    leaguesData = mockLeagues;
  });

  it('åbner detaljevisning ved klik på ligakort', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    // Detaljesiden vises
    expect(screen.getByText('← Tilbage')).toBeInTheDocument();
  });

  it('viser kun ligamedlemmer i rangering', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    // Alice (uid-1) og Mig (me-uid) er med i ligaen, Charlie er ikke
    // Brug getAllByText da Alice kan optræde i tabel OG i admin-sektion (ejer)
    const aliceElements = screen.getAllByText('Alice');
    expect(aliceElements.length).toBeGreaterThan(0);
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('viser "Tilbage"-knap og lukker detaljevisning', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    fireEvent.click(screen.getByText('← Tilbage'));
    // Tilbage til listevisning
    expect(screen.getByText('Testliga')).toBeInTheDocument();
  });
});
