/**
 * LeagueBonus — ligaens egne bonusspørgsmål: opret (manager), besvar (medlem),
 * sæt facit (manager) og se point. Point tæller kun i denne liga.
 */
import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';
import { createLeagueBonus, setLeagueBonusFacit, deleteLeagueBonus, saveLeagueBonusAnswer } from './leagueBonusActions';
import { scoreLeagueBonus } from './leagueBonusScoring';
import { formatTimestamp } from '../comments/formatTimestamp';

const TYPE_LABEL = {
  [LEAGUE_BONUS_TYPE.TEXT]: 'Fritekst',
  [LEAGUE_BONUS_TYPE.CHOICE]: 'Valg',
  [LEAGUE_BONUS_TYPE.TOPLIST]: 'Top-liste',
  [LEAGUE_BONUS_TYPE.YESNO]: 'Ja/Nej',
};

function isPast(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
}

// ── Svar-/facit-input pr. type ────────────────────────────────────────────────
function AnswerInput({ q, value, onChange, disabled }) {
  if (q.type === LEAGUE_BONUS_TYPE.CHOICE) {
    return (
      <select className="select" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">– Vælg –</option>
        {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === LEAGUE_BONUS_TYPE.YESNO) {
    return (
      <select className="select" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
    <input className="input" disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Dit svar" />
  );
}

// ── Ét spørgsmål ──────────────────────────────────────────────────────────────
function QuestionCard({ q, meUid, isManager, initialAnswer }) {
  const [answer, setAnswer] = useState(initialAnswer ?? (q.type === LEAGUE_BONUS_TYPE.TOPLIST ? [] : ''));
  const [facit, setFacit] = useState(q.facit ?? (q.type === LEAGUE_BONUS_TYPE.TOPLIST ? [] : ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const locked = isPast(q.deadline);

  async function save() {
    setBusy(true); setMsg('');
    try {
      await saveLeagueBonusAnswer({ questionId: q.id, leagueId: q.leagueId, uid: meUid, answer });
      setMsg('Gemt ✔');
    } catch (e) { setMsg('Fejl: ' + e.message); }
    finally { setBusy(false); }
  }
  async function saveFacit() {
    setBusy(true); setMsg('');
    try { await setLeagueBonusFacit(q.id, facit); setMsg('Facit gemt ✔'); }
    catch (e) { setMsg('Fejl: ' + e.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Slet spørgsmålet?')) return;
    try { await deleteLeagueBonus(q.id); } catch (e) { alert(e.message); }
  }

  const myPts = (q.facit != null && q.facit !== '') ? scoreLeagueBonus(q, initialAnswer) : null;

  return (
    <li style={{ borderBottom: '1px solid var(--c-border)', padding: '0.6rem 0' }}>
      <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.95rem' }}>{q.label}</strong>
        <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <span className="badge badge--muted">{TYPE_LABEL[q.type]}</span>
          <span className="badge badge--muted" title="Svarfrist">⏱ {formatTimestamp(q.deadline)}</span>
          {isManager && (
            <button className="btn--icon" title="Slet" onClick={remove}
              style={{ background: 'none', border: 'none', color: 'var(--c-err)', cursor: 'pointer' }}>✕</button>
          )}
        </span>
      </div>

      {/* Besvarelse (før deadline) eller dit svar + point (efter) */}
      {!locked ? (
        <div style={{ marginTop: '0.4rem' }}>
          <AnswerInput q={q} value={answer} onChange={setAnswer} />
          <button className="btn btn--sm mt-1" disabled={busy} onClick={save}>Gem svar</button>
        </div>
      ) : (
        <div style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
          <div>Dit svar: <strong>{Array.isArray(initialAnswer) ? initialAnswer.join(', ') : (initialAnswer || '—')}</strong></div>
          {q.facit != null && q.facit !== '' && (
            <div>Facit: <strong>{Array.isArray(q.facit) ? q.facit.join(', ') : q.facit}</strong>
              {myPts != null && <span className="badge badge--green" style={{ marginLeft: '0.4rem' }}>+{myPts} point</span>}
            </div>
          )}
        </div>
      )}

      {/* Manager: sæt facit */}
      {isManager && (
        <div style={{ marginTop: '0.5rem', padding: '0.4rem', background: 'var(--c-surface-2, #f7f7f7)', borderRadius: 8 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.2rem' }}>Facit (kun manager):</div>
          <AnswerInput q={q} value={facit} onChange={setFacit} />
          <button className="btn btn--sm btn--ghost mt-1" disabled={busy} onClick={saveFacit}>Gem facit</button>
        </div>
      )}
      {msg && <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginTop: '0.2rem' }}>{msg}</p>}
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
