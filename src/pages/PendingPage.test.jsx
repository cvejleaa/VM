// Tests for PendingPage — viser korrekt besked pr. status
// og redirecter ved godkendt bruger.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Mock react-router-dom navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import PendingPage from './PendingPage';

function renderPendingPage() {
  return render(
    <MemoryRouter>
      <PendingPage />
    </MemoryRouter>
  );
}

describe('PendingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('viser ventebesked for pending bruger', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'pending',
      loading: false,
    });
    renderPendingPage();

    expect(screen.getByText(/Afventer godkendelse/i)).toBeInTheDocument();
    // Bekræft at mindst ét element med "administrator" vises
    expect(screen.getAllByText(/administrator/i).length).toBeGreaterThan(0);
  });

  it('viser "Log ud"-knap for pending bruger', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'pending',
      loading: false,
    });
    renderPendingPage();

    expect(screen.getByRole('button', { name: /Log ud/i })).toBeInTheDocument();
  });

  it('viser afvist-besked for rejected bruger', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'rejected',
      loading: false,
    });
    renderPendingPage();

    expect(screen.getByText(/Adgang afvist/i)).toBeInTheDocument();
    // Mindst ét element med "afvist"
    expect(screen.getAllByText(/afvist/i).length).toBeGreaterThan(0);
  });

  it('viser "Log ud"-knap for rejected bruger', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'rejected',
      loading: false,
    });
    renderPendingPage();

    expect(screen.getByRole('button', { name: /Log ud/i })).toBeInTheDocument();
  });

  it('redirecter approved bruger til "/"', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'approved',
      loading: false,
    });
    renderPendingPage();

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('viser indlæsningsindikator mens loading er true', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      status: 'pending',
      loading: true,
    });
    renderPendingPage();

    expect(screen.getByText(/Indlæser/i)).toBeInTheDocument();
  });

  it('redirecter til /login når bruger ikke er logget ind', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      status: 'pending',
      loading: false,
    });
    renderPendingPage();

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('logger ud og navigerer til /login ved klik på log ud', async () => {
    const { signOut } = await import('firebase/auth');
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'pending',
      loading: false,
    });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it('viser IKKE ventebesked for rejected bruger', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'rejected',
      loading: false,
    });
    renderPendingPage();

    expect(screen.queryByText(/Afventer godkendelse/i)).not.toBeInTheDocument();
  });

  it('viser IKKE afvist-besked for pending bruger', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      status: 'pending',
      loading: false,
    });
    renderPendingPage();

    expect(screen.queryByText(/Adgang afvist/i)).not.toBeInTheDocument();
  });
});
