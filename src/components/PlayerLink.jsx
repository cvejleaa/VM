// Gør en spiller klikbar → fører til spillerens side (/spiller/:id). Uden id
// (fx navn uden playerId) rendres children uændret uden link.
import { Link } from 'react-router-dom';

export default function PlayerLink({ id, children, style }) {
  if (!id) return <>{children}</>;
  return (
    <Link to={`/spiller/${id}`} style={{ color: 'inherit', textDecoration: 'none', ...style }}>
      {children}
    </Link>
  );
}
