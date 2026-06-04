// Admin-panel med tre faner:
//   1. Brugere (kun owner)
//   2. Kampe & resultater (matchAdmin + owner)
//   3. Bonus-facit (matchAdmin + owner)
// Rollebaseret adgang håndhæves her og i ProtectedRoute.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import UsersTab from '../features/admin/UsersTab';
import MatchesTab from '../features/admin/MatchesTab';
import BonusTab from '../features/admin/BonusTab';
import LeaguesAdminTab from '../features/admin/LeaguesAdminTab';
import TestsTab from '../features/admin/TestsTab';

// Fane-id'er
const TAB_USERS   = 'users';
const TAB_MATCHES = 'matches';
const TAB_BONUS   = 'bonus';
const TAB_LEAGUES = 'leagues';
const TAB_TESTS   = 'tests';

export default function AdminPage() {
  const { isOwner } = useAuth();

  // Sæt starttab til 'matches' for matchAdmin (der ikke er owner)
  const [tab, setTab] = useState(isOwner ? TAB_USERS : TAB_MATCHES);

  // Faner der er synlige for den aktuelle bruger
  const visibleTabs = [
    // Brugere: kun owner
    ...(isOwner
      ? [{ key: TAB_USERS, label: 'Brugere' }]
      : []),
    { key: TAB_MATCHES, label: 'Kampe & resultater' },
    { key: TAB_BONUS,   label: 'Bonus-facit' },
    { key: TAB_LEAGUES, label: 'Ligaer' },
    { key: TAB_TESTS,   label: 'Tests' },
  ];

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      {/* Overskrift */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', color: 'var(--c-pitch)', fontSize: '1.6rem' }}>
          ⚙️ Admin-panel
        </h1>
        <p style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.9rem' }}>
          {isOwner
            ? 'Du har fuld adgang som ejer.'
            : 'Du har adgang som kamp-administrator.'}
        </p>
      </div>

      {/* Fane-bjælke */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid var(--c-border)',
          marginBottom: '1.5rem',
          gap: 4,
        }}
      >
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`tab-${key}`}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'transparent',
              border: 'none',
              borderBottom:
                tab === key
                  ? '3px solid var(--c-pitch)'
                  : '3px solid transparent',
              color: tab === key ? 'var(--c-pitch)' : 'var(--c-muted)',
              fontWeight: tab === key ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.95rem',
              marginBottom: -2, // dækker border-bottom på containeren
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Fane-indhold */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {tab === TAB_USERS   && <UsersTab isOwner={isOwner} />}
        {tab === TAB_MATCHES && <MatchesTab />}
        {tab === TAB_BONUS   && <BonusTab />}
        {tab === TAB_LEAGUES && <LeaguesAdminTab />}
        {tab === TAB_TESTS   && <TestsTab />}
      </div>
    </div>
  );
}
