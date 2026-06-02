/**
 * Tests for StandingsTable-komponenten.
 * Bruger vi.mock til at isolere Firebase-afhængigheder.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StandingsTable from './StandingsTable';

// Mock standingsUtils – vi tester komponentens adfærd, ikke utilities
vi.mock('./standingsUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return actual; // Brug de rigtige utils i komponenten
});

const testUsers = [
  { uid: 'uid-1', displayName: 'Alice', totalPoints: 30 },
  { uid: 'uid-2', displayName: 'Bob', totalPoints: 50 },
  { uid: 'uid-3', displayName: 'Charlie', totalPoints: 20 },
  { uid: 'uid-4', displayName: 'Diana', totalPoints: 50 },
];

describe('StandingsTable', () => {
  it('sorterer brugere faldende efter point', () => {
    render(<StandingsTable users={testUsers} />);
    const rows = screen.getAllByRole('row').slice(1); // spring header over
    // Bob og Diana begge 50 point → first, derefter Alice (30), Charlie (20)
    expect(rows[0]).toHaveTextContent('50');
    expect(rows[1]).toHaveTextContent('50');
    const lastRow = rows[rows.length - 1];
    expect(lastRow).toHaveTextContent('20');
  });

  it('viser "dig"-badge for den indloggede bruger', () => {
    render(<StandingsTable users={testUsers} meUid="uid-1" />);
    expect(screen.getByText('dig')).toBeInTheDocument();
  });

  it('fremhæver den indloggede brugers række med is-me-klassen', () => {
    render(<StandingsTable users={testUsers} meUid="uid-1" />);
    const meRow = screen.getByText('Alice').closest('tr');
    expect(meRow).toHaveClass('is-me');
  });

  it('andre rækker har IKKE is-me-klassen', () => {
    render(<StandingsTable users={testUsers} meUid="uid-1" />);
    const bobRow = screen.getByText('Bob').closest('tr');
    expect(bobRow).not.toHaveClass('is-me');
  });

  it('viser medalje-emojis for top-3', () => {
    render(<StandingsTable users={testUsers} />);
    expect(screen.getByLabelText('Placering 1')).toHaveTextContent('🥇');
    expect(screen.getByLabelText('Placering 2')).toHaveTextContent('🥈');
    expect(screen.getByLabelText('Placering 3')).toHaveTextContent('🥉');
  });

  it('filtrerer til kun memberUids når angivet', () => {
    render(<StandingsTable users={testUsers} memberUids={['uid-1', 'uid-3']} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Diana')).not.toBeInTheDocument();
  });

  it('viser tom-tilstand når ingen spillere matcher filter', () => {
    render(
      <StandingsTable
        users={testUsers}
        memberUids={['uid-999']}
        emptyMsg="Ingen matcher."
      />
    );
    expect(screen.getByText('Ingen matcher.')).toBeInTheDocument();
  });

  it('viser spinner under loading', () => {
    render(<StandingsTable users={[]} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('bruger getPoints-funktion til at hente daglige point', () => {
    const getPoints = (uid) => ({ 'uid-2': 15, 'uid-1': 5 }[uid] ?? 0);
    render(<StandingsTable users={testUsers} getPoints={getPoints} />);

    // Bob (15 pt) bør stå øverst
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('15');
  });

  it('viser alle spillere med totalPoints=0 når getPoints ikke er sat og ingen point', () => {
    const usersNoPts = testUsers.map((u) => ({ ...u, totalPoints: 0 }));
    render(<StandingsTable users={usersNoPts} />);
    const ptsCells = screen.getAllByText('0');
    expect(ptsCells.length).toBeGreaterThan(0);
  });
});
