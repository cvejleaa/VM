// Tests for LoginPage — fejlbesked-oversættelse og formular-adfærd.
// Firebase og AuthContext mockes, så testene kører uden netværk.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Mock useAuthActions ───────────────────────────────────────────────────────
const mockLogin = vi.fn();
const mockSignup = vi.fn();
const mockResetPassword = vi.fn();
const mockClearError = vi.fn();

vi.mock('../features/auth/useAuthActions', () => ({
  useAuthActions: () => ({
    loading: false,
    error: '',
    clearError: mockClearError,
    signup: mockSignup,
    login: mockLogin,
    resetPassword: mockResetPassword,
  }),
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

import LoginPage from './LoginPage';

// Hjælpefunktion til at rendere siden i en MemoryRouter
function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

// Hjælper: find faneknap med givet tekst (ingen type="submit")
function getTabButton(label) {
  return screen.getAllByRole('button', { name: label }).find(
    (btn) => !btn.getAttribute('type') || btn.getAttribute('type') === 'button'
  );
}

// Hjælper: find submit-knap med givet tekst
function getSubmitButton(label) {
  return screen.getAllByRole('button', { name: label }).find(
    (btn) => btn.getAttribute('type') === 'submit'
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Standard: ingen bruger logget ind
    mockUseAuth.mockReturnValue({
      user: null,
      isApproved: false,
      status: 'pending',
    });
  });

  it('viser "Log ind"-fane som standard', () => {
    renderLoginPage();
    // Brug getAllByText — begge er i DOM, men siden er i login-tilstand
    const logIndElements = screen.getAllByText('Log ind');
    expect(logIndElements.length).toBeGreaterThan(0);
  });

  it('viser "Opret bruger"-fane', () => {
    renderLoginPage();
    const opretElements = screen.getAllByText('Opret bruger');
    expect(opretElements.length).toBeGreaterThan(0);
  });

  it('viser VM 2026-overskrift', () => {
    renderLoginPage();
    expect(screen.getByText(/VM 2026 Tip/i)).toBeInTheDocument();
  });

  it('viser login-formular som standard med e-mail og adgangskode', () => {
    renderLoginPage();
    // E-mail-feltet og adgangskodefeltet skal være synlige
    expect(screen.getByPlaceholderText('din@email.dk')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('skifter til opret-bruger-formular ved klik på fanen', () => {
    renderLoginPage();
    const opretFane = getTabButton('Opret bruger');
    fireEvent.click(opretFane);
    expect(screen.getByLabelText(/Visningsnavn/i)).toBeInTheDocument();
  });

  it('viser "Glemt adgangskode?"-knap i login-fane', () => {
    renderLoginPage();
    expect(screen.getByText(/Glemt adgangskode/i)).toBeInTheDocument();
  });

  it('viser nulstillingsformular ved klik på glemt adgangskode', () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    expect(screen.getByText(/Send nulstillingslink/i)).toBeInTheDocument();
  });

  it('kalder login med korrekte data ved indsendelse', async () => {
    mockLogin.mockResolvedValue({ user: { uid: '123' } });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('din@email.dk'), {
      target: { value: 'test@test.dk' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    // Klik på submit-knappen i login-formularen
    const loginSubmit = getSubmitButton('Log ind');
    fireEvent.click(loginSubmit);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@test.dk', 'password123');
    });
  });

  it('validerer manglende visningsnavn ved opret bruger', async () => {
    renderLoginPage();
    // Skift til opret-fanen
    fireEvent.click(getTabButton('Opret bruger'));

    // Klik submit uden at udfylde noget
    const submitBtn = getSubmitButton('Opret bruger');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/visningsnavn/i);
    });
  });

  it('validerer adgangskode for kort ved opret bruger', async () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Anders' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'anders@test.dk' },
    });
    fireEvent.change(screen.getByLabelText(/Adgangskode/i), {
      target: { value: '123' }, // for kort
    });

    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/6 tegn/i);
    });
  });

  it('navigerer til /afventer efter vellykket oprettelse', async () => {
    mockSignup.mockResolvedValue({ uid: 'new-uid' });
    renderLoginPage();

    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Ny Bruger' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ny@test.dk' },
    });
    fireEvent.change(screen.getByLabelText(/Adgangskode/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith('ny@test.dk', 'password123', 'Ny Bruger');
      expect(mockNavigate).toHaveBeenCalledWith('/afventer', { replace: true });
    });
  });

  it('redirecter godkendt bruger til forsiden', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      isApproved: true,
      status: 'approved',
    });
    renderLoginPage();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('redirecter ikke-godkendt logget-ind bruger til /afventer', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'abc' },
      isApproved: false,
      status: 'pending',
    });
    renderLoginPage();
    expect(mockNavigate).toHaveBeenCalledWith('/afventer', { replace: true });
  });
});
