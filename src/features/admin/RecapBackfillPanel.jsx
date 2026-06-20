// Engangs-værktøj (kun ejer): genskriv VM-Bottens gamle opslag med den korrekte
// logik og stillingen, som den var dengang. Kun teksten ændres — tidspunkterne
// (createdAt) røres ikke. Tør-kør viser forhåndsvisninger før noget gemmes.
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { callRegenerateRecaps } from './adminActions';

export default function RecapBackfillPanel() {
  const { isOwner } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [previews, setPreviews] = useState(null);

  if (!isOwner) return null;

  async function run(apply) {
    if (apply && !window.confirm('Gem de genskrevne tekster på alle bottens opslag? Tidspunkterne røres ikke.')) return;
    setBusy(true);
    setMsg('');
    const res = await callRegenerateRecaps({ apply });
    setBusy(false);
    if (!res.ok) { setMsg(`Fejl: ${res.error}`); return; }
    const d = res.data || {};
    if (apply) {
      setPreviews(null);
      setMsg(`Gemt: ${d.updated} opslag opdateret i ${d.leagues} liga(er).`);
    } else {
      setPreviews(d.previews || []);
      setMsg(`Tør-kør: ${d.posts} opslag i ${d.leagues} liga(er). Gennemse nedenfor, og tryk "Gem alle", hvis det ser rigtigt ud.`);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--c-border)' }}>
      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>🤖 Genskriv VM-Bottens gamle opslag</h3>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: 'var(--c-muted)' }}>
        Genskriver teksten på alle bottens opslag (alle ligaer) med stillingen, som den var, da opslaget blev lavet.
        Kun teksten ændres — tidspunkterne røres ikke. Tør-kør gemmer intet.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => run(false)} disabled={busy}>
          {busy ? 'Kører…' : '🔎 Tør-kør'}
        </button>
        <button className="btn btn--sm" onClick={() => run(true)} disabled={busy || !previews}>
          💾 Gem alle
        </button>
      </div>

      {msg && (
        <div role="alert" style={{
          marginTop: '0.6rem', padding: '0.5rem 0.8rem', borderRadius: 8, fontSize: '0.85rem',
          background: msg.startsWith('Fejl') ? '#fef2f2' : '#f0fdf4',
          color: msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
          border: `1px solid ${msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)'}`,
        }}>
          {msg}
        </div>
      )}

      {previews && previews.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 480, overflowY: 'auto' }}>
          {previews.map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: '0.5rem 0.7rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                {p.leagueName} · {p.date}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', whiteSpace: 'pre-wrap', marginBottom: '0.3rem' }}>
                <strong>Før:</strong> {p.oldText || '(tom)'}
              </div>
              <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                <strong>Efter:</strong> {p.newText}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
