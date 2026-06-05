// App-skal: top-navigation + indhold. Viser kun relevante links efter rolle.
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { usePendingApprovals } from '../features/admin/usePendingApprovals';
import Avatar from './Avatar';

const linkStyle = ({ isActive }) => ({
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  textDecoration: 'none',
  color: isActive ? '#fff' : 'var(--c-text)',
  background: isActive ? 'var(--c-pitch)' : 'transparent',
  fontWeight: 600,
});

export default function Layout({ children }) {
  const { user, isApproved, isMatchAdmin, isOwner, profile } = useAuth();
  const navigate = useNavigate();
  // Antal ventende godkendelser (brugere for ejer + ligaer for alle admins)
  const { total: pendingCount } = usePendingApprovals({ enabled: isMatchAdmin, includeUsers: isOwner });

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
        <nav className="container" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ marginRight: 'auto', color: 'var(--c-pitch)' }}>⚽ VM 2026 Tip</strong>
          {user && isApproved && (
            <>
              <NavLink to="/" style={linkStyle} end>Kampe</NavLink>
              <NavLink to="/mine-tips" style={linkStyle}>Mine tips</NavLink>
              <NavLink to="/bonus" style={linkStyle}>Bonus</NavLink>
              <NavLink to="/turnering" style={linkStyle}>Turnering</NavLink>
              <NavLink to="/stilling" style={linkStyle}>Stilling</NavLink>
              <NavLink to="/statistik" style={linkStyle}>Statistik</NavLink>
              <NavLink to="/ligaer" style={linkStyle}>Ligaer</NavLink>
              <NavLink to="/beskeder" style={linkStyle}>Beskeder</NavLink>
              {isMatchAdmin && (
                <NavLink to="/admin" style={linkStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    Admin
                    {pendingCount > 0 && (
                      <span
                        data-testid="admin-pending-count"
                        title={`${pendingCount} venter på godkendelse`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99,
                          background: 'var(--c-err)', color: '#fff', fontSize: '0.7rem', fontWeight: 800,
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </span>
                </NavLink>
              )}
            </>
          )}
          {user && isApproved && (
            <NavLink to="/profil" style={linkStyle} title="Min profil"
              aria-label="Min profil">
              <Avatar uid={user.uid} name={profile?.displayName} emoji={profile?.avatarEmoji}
                favoriteTeam={profile?.favoriteTeam} size={26} />
            </NavLink>
          )}
          {user ? (
            <button className="btn btn--ghost" onClick={() => signOut(auth).then(() => navigate('/login'))}>
              Log ud{profile?.displayName ? ` (${profile.displayName})` : ''}
            </button>
          ) : (
            <NavLink to="/login" style={linkStyle}>Log ind</NavLink>
          )}
          {isOwner && <span title="Ejer" style={{ fontSize: 12, color: 'var(--c-muted)' }}>ejer</span>}
        </nav>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
