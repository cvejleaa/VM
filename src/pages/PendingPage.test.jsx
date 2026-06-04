// Udtømmende tests for PendingPage — viser korrekt indhold pr. status og redirecter.
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
  return { ...actual, useNavigate: () => mockNavigate };
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

  // ─── Loading-tilstand ─────────────────────────────────────────────────────

  it('viser indlæsningsindikator mens loading er true', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'pending', loading: true });
    renderPendingPage();
    expect(screen.getByText(/Indlæser/i)).toBeInTheDocument();
  });

  it('viser IKKE afventside-indhold under loading', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'pending', loading: true });
    renderPendingPage();
    expect(screen.queryByText(/Afventer godkendelse/i)).not.toBeInTheDocument();
  });

  // ─── Pending-status ───────────────────────────────────────────────────────

  it('viser Afventer godkendelse-overskrift for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByText(/Afventer godkendelse/i)).toBeInTheDocument();
  });

  it('viser administrator-besked for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getAllByText(/administrator/i).length).toBeGreaterThan(0);
  });

  it('viser Hvad sker der nu-liste for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByText(/Hvad sker der nu/i)).toBeInTheDocument();
  });

  it('viser Log ud-knap for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByRole('button', { name: /Log ud/i })).toBeInTheDocument();
  });

  it('viser IKKE Adgang afvist for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.queryByText(/Adgang afvist/i)).not.toBeInTheDocument();
  });

  // ─── Rejected-status ──────────────────────────────────────────────────────

  it('viser Adgang afvist-overskrift for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getByText(/Adgang afvist/i)).toBeInTheDocument();
  });

  it('viser afvist-statusbesked for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getAllByText(/afvist/i).length).toBeGreaterThan(0);
  });

  it('viser Log ud-knap for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getByRole('button', { name: /Log ud/i })).toBeInTheDocument();
  });

  it('viser IKKE Afventer godkendelse for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.queryByText(/Afventer godkendelse/i)).not.toBeInTheDocument();
  });

  it('viser kontaktoplysninger til turneringsarrangør for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getByText(/turneringsarrangøren/i)).toBeInTheDocument();
  });

  // ─── Approved → redirect ──────────────────────────────────────────────────

  it('redirecter approved bruger til "/"', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'approved', loading: false });
    renderPendingPage();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('redirecter ikke-logget-ind bruger til /login', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'pending', loading: false });
    renderPendingPage();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('redirecter IKKE pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirecter IKKE rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ─── Log ud-knap ──────────────────────────────────────────────────────────

  it('kalder signOut ved klik på Log ud for pending bruger', async () => {
    const { signOut } = await import('firebase/auth');
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it('navigerer til /login efter log ud for pending bruger', async () => {
    const { signOut } = await import('firebase/auth');
    signOut.mockResolvedValue(undefined);

    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('kalder signOut ved klik på Log ud for rejected bruger', async () => {
    const { signOut } = await import('firebase/auth');
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });
});
