// Indstillinger-fanen (kun ejer). Pt. ét valg: tidspunktet for det AI-genererede
// morgenopslag (VM-Botten). Gemmes i config/settings og læses af Cloud Function'en
// generateLeagueRecaps, så tidspunktet kan ændres uden gen-deploy.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { setRecapTime } from './adminActions';

const DEFAULT_RECAP_TIME = '08:15';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SettingsTab() {
  const [time, setTime] = useState(DEFAULT_RECAP_TIME);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | 'error' | null

  useEffect(() => {
    const ref = doc(db, COL.CONFIG, 'settings');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap && typeof snap.exists === 'function' && snap.exists() ? snap.data() : null;
        setTime((d && d.recapTime) || DEFAULT_RECAP_TIME);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, []);

  const valid = TIME_RE.test(time);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setStatus(null);
    try {
      await setRecapTime(time);
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--c-pitch)' }}>
        🤖 AI-morgenopslag
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--c-muted)' }}>
        VM-Botten skriver hver morgen et kort opslag på væggen i hver liga med døgnets udvikling
        og en lille optakt. Vælg hvornår det udgives (dansk tid).
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
          Udgivelsestidspunkt
          <input
            type="time"
            value={time}
            onChange={(e) => { setTime(e.target.value); setStatus(null); }}
            data-testid="recap-time"
            style={{ padding: '0.45rem 0.6rem', fontSize: '1rem', border: '1px solid var(--c-border)', borderRadius: 6 }}
          />
        </label>
        <button
          className="btn btn--primary"
          onClick={save}
          disabled={!valid || saving || !loaded}
          data-testid="save-recap-time"
        >
          {saving ? 'Gemmer…' : 'Gem'}
        </button>
        {status === 'saved' && <span style={{ color: 'var(--c-ok)', fontSize: '0.9rem' }}>✓ Gemt</span>}
        {status === 'error' && <span style={{ color: 'var(--c-err)', fontSize: '0.9rem' }}>Kunne ikke gemme.</span>}
        {!valid && <span style={{ color: 'var(--c-err)', fontSize: '0.9rem' }}>Ugyldigt tidspunkt.</span>}
      </div>

      <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
        Opslaget udgives én gang i døgnet, tidligst på det valgte tidspunkt. Standard er {DEFAULT_RECAP_TIME}.
      </p>
    </div>
  );
}
