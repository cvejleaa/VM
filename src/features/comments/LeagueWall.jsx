/**
 * LeagueWall — kommentar-væg for en liga.
 * Alle medlemmer kan læse og skrive; forfatter/ejer/admin kan slette.
 */
import { useState } from 'react';
import { useLeagueComments } from './useLeagueComments';
import { postLeagueComment, deleteLeagueComment } from './commentActions';
import { formatTimestamp } from './formatTimestamp';
import EmojiPicker from './EmojiPicker';

export default function LeagueWall({ leagueId, meUid, myName, isOwner = false, isAdmin = false }) {
  const { comments, loading, error } = useLeagueComments(leagueId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [postError, setPostError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setPostError('');
    try {
      await postLeagueComment({ leagueId, uid: meUid, displayName: myName, text });
      setText('');
    } catch (err) {
      setPostError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Slet kommentaren?')) return;
    try {
      await deleteLeagueComment(id);
    } catch (err) {
      alert('Kunne ikke slette: ' + err.message);
    }
  }

  return (
    <div className="card mt-2">
      <h3 className="card__title mb-2">💬 Liga-væg</h3>

      {error && <p className="form-error mb-1" role="alert">{error}</p>}

      {/* Besked-liste */}
      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : comments.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>
          Ingen beskeder endnu. Vær den første til at skrive! 👋
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {comments.map((c) => {
            const mine = c.uid === meUid;
            const canDelete = mine || isOwner || isAdmin;
            return (
              <li
                key={c.id}
                data-testid="league-comment"
                style={{
                  background: mine ? 'var(--c-pitch-tint, rgba(0,128,0,0.06))' : 'var(--c-surface-2, #f7f7f7)',
                  borderRadius: 10,
                  padding: '0.55rem 0.7rem',
                }}
              >
                <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.86rem' }}>
                    {c.displayName || 'Spiller'}
                    {mine && <span className="badge badge--blue" style={{ marginLeft: '0.4rem' }}>dig</span>}
                  </strong>
                  <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                    <time style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>
                      {formatTimestamp(c.createdAt)}
                    </time>
                    {canDelete && (
                      <button
                        title="Slet"
                        aria-label="Slet kommentar"
                        onClick={() => handleDelete(c.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--c-err)', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '0.15rem' }}>
                  {c.text}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Skriv-formular */}
      <form onSubmit={handleSubmit} style={{ marginTop: '0.75rem' }}>
        <textarea
          className="input"
          rows={2}
          placeholder="Skriv en besked til ligaen…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          aria-label="Ny besked til liga-væggen"
          style={{ resize: 'vertical' }}
        />
        {postError && <p className="form-error mt-1">{postError}</p>}
        <div className="flex gap-1 mt-1" style={{ alignItems: 'center' }}>
          <EmojiPicker onSelect={(e) => setText((t) => t + e)} />
          <button className="btn btn--sm" type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Sender…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
