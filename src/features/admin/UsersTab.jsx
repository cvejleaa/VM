// Brugerfanen i admin-panelet — kun tilgængelig for owner.
// Viser alle brugere og lader admin godkende/afvise og tildele roller.
import { useUsers } from './useUsers';
import UserRow from './UserRow';
import { USER_STATUS } from '../../lib/constants';

/**
 * @param {{ isOwner: boolean }} props
 */
export default function UsersTab({ isOwner }) {
  const { users, loading, error } = useUsers();

  if (!isOwner) {
    // Denne fane må aldrig vises for ikke-ejere — dobbelt sikring
    return null;
  }

  if (loading) {
    return <p style={{ color: 'var(--c-muted)' }}>Henter brugere…</p>;
  }

  if (error) {
    return (
      <p role="alert" style={{ color: 'var(--c-err)' }}>
        {error}
      </p>
    );
  }

  // Sortér: pending øverst, dernæst approved, til sidst rejected
  const statusOrder = {
    [USER_STATUS.PENDING]: 0,
    [USER_STATUS.APPROVED]: 1,
    [USER_STATUS.REJECTED]: 2,
  };
  const sorted = [...users].sort(
    (a, b) =>
      (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
  );

  const pending = sorted.filter((u) => u.status === USER_STATUS.PENDING);

  return (
    <div>
      {pending.length > 0 && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid var(--c-warn)',
            borderRadius: 10,
            padding: '0.6rem 1rem',
            marginBottom: '1rem',
            fontSize: '0.88rem',
            color: 'var(--c-warn)',
          }}
        >
          {pending.length === 1
            ? '1 bruger afventer godkendelse.'
            : `${pending.length} brugere afventer godkendelse.`}
        </div>
      )}

      {users.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen brugere registreret endnu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sorted.map((u) => (
            <UserRow key={u.id} user={u} currentUserIsOwner={isOwner} />
          ))}
        </ul>
      )}
    </div>
  );
}
