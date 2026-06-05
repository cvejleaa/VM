// Én række i brugerlisten i admin-panelet.
// Viser navn, e-mail, rolle, status og handlingsknapper.
import { useState } from 'react';
import { ROLES, USER_STATUS } from '../../lib/constants';
import { setUserStatus, toggleMatchAdminRole } from './adminActions';
import Avatar from '../../components/Avatar';
import { teamName } from '../../lib/teams';

// Oversæt status til dansk
const statusLabel = {
  [USER_STATUS.PENDING]:  'Afventer',
  [USER_STATUS.APPROVED]: 'Godkendt',
  [USER_STATUS.REJECTED]: 'Afvist',
};

// Farve pr. status
const statusColor = {
  [USER_STATUS.PENDING]:  'var(--c-warn)',
  [USER_STATUS.APPROVED]: 'var(--c-ok)',
  [USER_STATUS.REJECTED]: 'var(--c-err)',
};

// Oversæt rolle til dansk
const roleLabel = {
  [ROLES.OWNER]:       'Ejer',
  [ROLES.MATCH_ADMIN]: 'Kamp-admin',
  [ROLES.PLAYER]:      'Spiller',
};

/**
 * @param {{ user: object, currentUserIsOwner: boolean }} props
 */
export default function UserRow({ user, currentUserIsOwner }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const isOwner = user.role === ROLES.OWNER;

  async function handleStatus(newStatus) {
    const label = newStatus === USER_STATUS.APPROVED ? 'godkende' : 'afvise';
    if (!window.confirm(`Er du sikker på, at du vil ${label} ${user.displayName}?`)) return;

    setBusy(true);
    setLocalError('');
    try {
      await setUserStatus(user.id, newStatus);
    } catch (err) {
      setLocalError('Fejl: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleToggle() {
    const newRole =
      user.role === ROLES.MATCH_ADMIN ? 'spiller' : 'kamp-admin';
    if (
      !window.confirm(
        `Skift ${user.displayName} til ${newRole}?`
      )
    )
      return;

    setBusy(true);
    setLocalError('');
    try {
      await toggleMatchAdminRole(user.id, user.role);
    } catch (err) {
      setLocalError('Fejl: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '0.5rem',
        alignItems: 'start',
        padding: '0.75rem 0',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      {/* Info */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <Avatar uid={user.id} name={user.displayName} emoji={user.avatarEmoji}
          favoriteTeam={user.favoriteTeam} size={40} />
        <div>
          <div style={{ fontWeight: 600 }}>
            {user.displayName || '(ingen navn)'}
            {isOwner && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: '0.7rem',
                  background: 'var(--c-pitch)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}
              >
                EJER
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
            {user.email}
          </div>
          <div style={{ marginTop: 2, fontSize: '0.82rem' }}>
            <span style={{ color: statusColor[user.status] ?? 'var(--c-muted)' }}>
              {statusLabel[user.status] ?? user.status}
            </span>
            {' · '}
            <span style={{ color: 'var(--c-muted)' }}>
              {roleLabel[user.role] ?? user.role}
            </span>
            {' · '}
            <span style={{ color: 'var(--c-muted)' }}>
              {user.totalPoints ?? 0} point
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            Yndlingshold: {user.favoriteTeam ? teamName(user.favoriteTeam) : '–'}
            {' · '}
            Avatar: {user.avatarEmoji || '–'}
            {' · '}
            Påmindelser: {user.emailOptOut ? 'Fra' : 'Til'}
          </div>
          {localError && (
            <div style={{ color: 'var(--c-err)', fontSize: '0.8rem', marginTop: 4 }}>
              {localError}
            </div>
          )}
        </div>
      </div>

      {/* Handlingsknapper — skjules for owner */}
      {!isOwner && currentUserIsOwner && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {/* Godkend/afvis */}
          {user.status !== USER_STATUS.APPROVED && (
            <button
              className="btn"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', background: 'var(--c-ok)' }}
              disabled={busy}
              onClick={() => handleStatus(USER_STATUS.APPROVED)}
            >
              Godkend
            </button>
          )}
          {user.status !== USER_STATUS.REJECTED && (
            <button
              className="btn"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', background: 'var(--c-err)' }}
              disabled={busy}
              onClick={() => handleStatus(USER_STATUS.REJECTED)}
            >
              Afvis
            </button>
          )}

          {/* Skift matchAdmin-rolle */}
          <button
            className="btn btn--ghost"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
            disabled={busy}
            onClick={handleRoleToggle}
          >
            {user.role === ROLES.MATCH_ADMIN ? '↓ Til spiller' : '↑ Til kamp-admin'}
          </button>
        </div>
      )}
    </li>
  );
}
