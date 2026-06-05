/**
 * LeagueBonus — ligaens egne bonusspørgsmål: opret (manager), besvar (medlem),
 * sæt facit (manager) og se point. Point tæller kun i denne liga.
 */
import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';
import { createLeagueBonus, setLeagueBonusFacit, deleteLeagueBonus, saveLeagueBonusAnswer } from './leagueBonusActions';
import { scoreLeagueBonus } from './leagueBonusScoring';
import { isBonusLocked, formatDeadline } from '../bonus/bonusHelpers';

const TYPE_BADGE = {
  [LEAGUE_BONUS_TYPE.TEXT]: '✍️ Fritekst',
  [LEAGUE_BONUS_TYPE.CHOICE]: '🔘 Valg',
  [LEAGUE_BONUS_TYPE.TOPLIST]: '🔢 Top-liste',
  [LEAGUE_BONUS_TYPE.YESNO]: '🔀 Ja/Nej',
};

const YESNO_LABEL = { yes: 'Ja', no: 'Nej' };

function hasAnswer(value) {
  if (Array.isArray(value)) return value.some((v) => (v ?? '').trim());
  return !!(value ?? '').trim();
}

function displayAnswer(value) {
  if (Array.isArray(value)) return value.filter((v) => (v ?? '').trim()).join(', ') || '—';
  if (value === 'yes' || value === 'no') return YESNO_LABEL[value];
  return value || '—';
}

// ── Svar-/facit-input pr. type ────────────────────────────────────────────────
function AnswerInput({ q, value, onChange, disabled }) {
  if (q.type === LEAGUE_BONUS_TYPE.CHOICE) {
    return (
      <select className="select" style={{ maxWidth: 300 }} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">– Vælg –</option>
        {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === LEAGUE_BONUS_TYPE.YESNO) {
    return (
      <select className="select" style={{ maxWidth: 300 }} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">– Vælg –</option>
        <option value="yes">Ja</option>
        <option value="no">Nej</option>
      </select>
    );
  }
  if (q.type === LEAGUE_BONUS_TYPE.TOPLIST) {
    const arr = Array.isArray(value) ? value : [];
    const size = q.size ?? 5;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: 300 }}>
        {Array.from({ length: size }).map((_, i) => (
          <input
            key={i} className="input" disabled={disabled}
            placeholder={`#${i + 1}`} value={arr[i] ?? ''}
            onChange={(e) => { const next = [...arr]; next[i] = e.target.value; onChange(next); }}
          />
        ))}
      </div>
    );
  }
  return (
    <input className="input" style={{ maxWidth: 300 }} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Dit svar..." />
  );
}

// ── Ét spørgsmål ──────────────────────────────────────────────────────────────
function QuestionCard({ q, meUid, isManager, initialAnswer }) {
  const locked = isBonusLocked(q.deadline);
  const empty = q.type === LEAGUE_BONUS_TYPE.TOPLIST ? [] : '';
  const [answer, setAnswer] = useState(initialAnswer ?? empty);
  const [facit, setFacit] = useState(q.facit ?? (q.type === LEAGUE_BONUS_TYPE.TOPLIST ? [] : ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [facitMsg, setFacitMsg] = useState('');

  // Synkroniser eksternt svar (fx ved load)
  useEffect(() => { setAnswer(initialAnswer ?? empty); }, [initialAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFinished = q.facit != null && q.facit !== '';
  const isAnswered = hasAnswer(initialAnswer);
  const earnedPoints = isFinished ? scoreLeagueBonus(q, initialAnswer) : null;

  async function handleSave() {
    if (!hasAnswer(answer) || locked) return;
    setSaving(true); setError('');
    try {
      await saveLeagueBonusAnswer({ questionId: q.id, leagueId: q.leagueId, uid: meUid, answer });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Kunne ikke gemme. Prøv igen.');
    } finally { setSaving(false); }
  }
  async function saveFacit() {
    setSaving(true); setFacitMsg('');
    try { await setLeagueBonusFacit(q.id, facit); setFacitMsg('✓ Facit gemt!'); setTimeout(() => setFacitMsg(''), 3000); }
    catch (e) { setFacitMsg('Fejl: ' + e.message); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm('Slet spørgsmålet?')) return;
    try { await deleteLeagueBonus(q.id); } catch (e) { window.alert(e.message); }
  }

  return (
    <li className="card" style={{ marginBottom: '0.75rem' }}>
      {/* Spørgsmålstekst + status */}
      <div style={{ marginBottom: '0.6rem' }}>
        <span className="badge badge--blue" style={{ marginBottom: '0.4rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          {TYPE_BADGE[q.type]}
          {isManager && (
            <button type="button" title="Slet spørgsmål" onClick={remove}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
          )}
        </span>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{q.label}</p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Deadline: {formatDeadline(q.deadline)}
          <span className={`badge ${locked ? 'badge--red' : 'badge--blue'}`} style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
            {locked ? 'Låst' : 'Åben'}
          </span>
        </p>
      </div>

      {/* Facit og point hvis afgjort */}
      {isFinished && (
        <div style={{ background: 'rgba(31,157,85,0.07)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
          <strong>Facit:</strong> {displayAnswer(q.facit)}
          {earnedPoints !== null && (
            <span className={`badge ${earnedPoints > 0 ? 'badge--green' : 'badge--muted'}`} style={{ marginLeft: '0.75rem' }}>
              {earnedPoints > 0 ? `+${earnedPoints} point` : '0 point'}
            </span>
          )}
        </div>
      )}

      {/* Svar-felt */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <AnswerInput q={q} value={answer} disabled={locked} onChange={(v) => { setAnswer(v); setSaved(false); }} />
        {!locked && (
          <button className="btn" onClick={handleSave} disabled={saving || !hasAnswer(answer)} style={{ whiteSpace: 'nowrap' }}>
            {saving ? 'Gemmer…' : 'Gem svar'}
          </button>
        )}
      </div>

      {/* Feedback */}
      {saved && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-ok)' }}>✓ Svar gemt!</p>}
      {error && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-err)' }}>{error}</p>}

      {/* Hjælpetekst for fritekst */}
      {!locked && q.type === LEAGUE_BONUS_TYPE.TEXT && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Store/små bogstaver, accenter og ekstra mellemrum er ligegyldige.
        </p>
      )}

      {/* Vis brugerens eget svar */}
      {isAnswered && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.83rem', color: 'var(--c-muted)' }}>
          Dit svar: <strong style={{ color: 'var(--c-text)' }}>{displayAnswer(initialAnswer)}</strong>
        </p>
      )}

      {/* Manager: sæt facit */}
      {isManager && (
        <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.75rem', background: 'var(--c-surface-2, rgba(0,0,0,0.04))', borderRadius: 8 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>Facit (kun managere):</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <AnswerInput q={q} value={facit} onChange={setFacit} />
            <button className="btn btn--ghost" onClick={saveFacit} disabled={saving} style={{ whiteSpace: 'nowrap' }}>Gem facit</button>
          </div>
          {facitMsg && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: facitMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>{facitMsg}</p>}
        </div>
      )}
    </li>
  );
}

// ── Opret-formular (manager) ────────────────────────────────────────────────
function CreateForm({ leagueId, meUid }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(LEAGUE_BONUS_TYPE.TEXT);
  const [label, setLabel] = useState('');
  const [deadline, setDeadline] = useState('');
  const [optionsStr, setOptionsStr] = useState('');
  const [size, setSize] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await createLeagueBonus({
        leagueId, createdBy: meUid, type, label,
        deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null,
        options: type === LEAGUE_BONUS_TYPE.CHOICE ? optionsStr.split(',') : [],
        size,
      });
      setLabel(''); setDeadline(''); setOptionsStr(''); setOpen(false);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return <button className="btn btn--sm mt-1" onClick={() => setOpen(true)}>+ Nyt bonusspørgsmål</button>;
  }
  return (
    <form onSubmit={submit} style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
        <option value={LEAGUE_BONUS_TYPE.TEXT}>Fritekst</option>
        <option value={LEAGUE_BONUS_TYPE.CHOICE}>Valg (1 ud af flere)</option>
        <option value={LEAGUE_BONUS_TYPE.TOPLIST}>Top-liste</option>
        <option value={LEAGUE_BONUS_TYPE.YESNO}>Ja/Nej</option>
      </select>
      <input className="input" placeholder="Spørgsmål" value={label} maxLength={140} onChange={(e) => setLabel(e.target.value)} required />
      {type === LEAGUE_BONUS_TYPE.CHOICE && (
        <input className="input" placeholder="Svarmuligheder, adskilt med komma" value={optionsStr} onChange={(e) => setOptionsStr(e.target.value)} />
      )}
      {type === LEAGUE_BONUS_TYPE.TOPLIST && (
        <label style={{ fontSize: '0.82rem' }}>Antal pladser:
          <input className="input" type="number" min={1} max={10} value={size} onChange={(e) => setSize(e.target.value)} style={{ width: 70, marginLeft: 6 }} />
        </label>
      )}
      <label style={{ fontSize: '0.82rem' }}>Svarfrist:
        <input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ marginLeft: 6 }} />
      </label>
      {err && <p className="form-error">{err}</p>}
      <div className="flex gap-1">
        <button className="btn btn--sm" type="submit" disabled={busy}>Opret</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setOpen(false)}>Annullér</button>
      </div>
    </form>
  );
}

export default function LeagueBonus({ leagueId, meUid, isManager, questions, myAnswers }) {
  return (
    <div className="card mt-2">
      <h3 className="card__title mb-2">🎲 Liga-bonus</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginTop: '-0.3rem' }}>
        Ligaens egne bonusspørgsmål. Point tæller kun i denne liga.
      </p>

      {questions.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>Ingen bonusspørgsmål endnu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {questions.map((q) => (
            <QuestionCard key={q.id} q={q} meUid={meUid} isManager={isManager} initialAnswer={myAnswers[q.id]} />
          ))}
        </ul>
      )}

      {isManager && <CreateForm leagueId={leagueId} meUid={meUid} />}
    </div>
  );
}
