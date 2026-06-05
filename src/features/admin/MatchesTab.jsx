// Kampe & resultater-fanen i admin-panelet.
// Tilgængelig for matchAdmin og owner.
import { useState } from 'react';
import { useMatches } from './useMatches';
import MatchResultForm from './MatchResultForm';
import MatchCreateForm from './MatchCreateForm';
import { callBuildKnockout, callBackfillTipParticipation, callSendTipRemindersNow, callSendTestReminderToMe, callPruneOrphanMatches, formatTimestamp } from './adminActions';
import { MATCH_STATUS, ROUNDS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';

// Oversæt runde til dansk
const ROUND_LABELS = {
  [ROUNDS.GROUP]:  'Gruppe',
  [ROUNDS.R32]:    '1/16',
  [ROUNDS.R16]:    '1/8',
  [ROUNDS.QF]:     'Kvart',
  [ROUNDS.SF]:     'Semi',
  [ROUNDS.BRONZE]: 'Bronze',
  [ROUNDS.FINAL]:  'Finale',
};

// Oversæt status til dansk
const STATUS_LABELS = {
  [MATCH_STATUS.SCHEDULED]:    'Planlagt',
  [MATCH_STATUS.PENDING_TEAMS]:'Afventer hold',
  [MATCH_STATUS.LIVE]:         'I gang',
  [MATCH_STATUS.FINISHED]:     'Afsluttet',
};

const STATUS_COLORS = {
  [MATCH_STATUS.SCHEDULED]:    'var(--c-muted)',
  [MATCH_STATUS.PENDING_TEAMS]:'var(--c-warn)',
  [MATCH_STATUS.LIVE]:         'var(--c-ok)',
  [MATCH_STATUS.FINISHED]:     'var(--c-pitch)',
};

export default function MatchesTab() {
  const { matches, loading, error } = useMatches();
  const [editMatchId, setEditMatchId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [knockoutMsg, setKnockoutMsg] = useState('');
  const [knockoutBusy, setKnockoutBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState('');
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  const [reminderBusy, setReminderBusy] = useState(false);
  const [pruneMsg, setPruneMsg] = useState('');
  const [pruneBusy, setPruneBusy] = useState(false);
  const { isOwner } = useAuth();

  async function handlePrune() {
    if (!window.confirm('Slet forældede knockout-kampe (gamle id\'er)? Dette kan ikke fortrydes.')) return;
    setPruneBusy(true);
    setPruneMsg('');
    const res = await callPruneOrphanMatches();
    setPruneBusy(false);
    setPruneMsg(res.ok
      ? `Slettet ${res.data?.deleted ?? 0} forældede kampe (${res.data?.remaining ?? '?'} tilbage)`
      : `Fejl: ${res.error}`);
  }

  async function handleSendReminders() {
    if (!window.confirm('Send e-mail-påmindelser til alle der mangler at tippe på dagens kampe?')) return;
    setReminderBusy(true);
    setReminderMsg('');
    const res = await callSendTipRemindersNow();
    setReminderBusy(false);
    setReminderMsg(res.ok
      ? `Påmindelser sendt: ${res.data?.sent ?? 0}`
      : `Fejl: ${res.error}`);
  }

  async function handleTestToMe() {
    setReminderBusy(true);
    setReminderMsg('');
    const res = await callSendTestReminderToMe();
    setReminderBusy(false);
    setReminderMsg(res.ok
      ? `Testmail sendt til ${res.data?.sentTo} (${res.data?.matches} kampe / ${res.data?.days} spilledage)`
      : `Fejl: ${res.error}`);
  }

  async function handleBackfill() {
    if (!window.confirm('Genopbyg tip-deltagelse ud fra alle eksisterende tips?')) return;
    setBackfillBusy(true);
    setBackfillMsg('');
    const res = await callBackfillTipParticipation();
    setBackfillBusy(false);
    setBackfillMsg(res.ok ? (res.data?.message ?? 'Backfill færdig!') : `Fejl: ${res.error}`);
  }

  async function handleBuildKnockout() {
    if (
      !window.confirm(
        'Er du sikker på, at du vil generere knockout-kampe? Dette kan ikke fortrydes.'
      )
    )
      return;

    setKnockoutBusy(true);
    setKnockoutMsg('');
    const res = await callBuildKnockout();
    setKnockoutBusy(false);
    setKnockoutMsg(
      res.ok
        ? 'Knockout-kampe er oprettet!'
        : `Fejl: ${res.error}`
    );
  }

  if (loading) {
    return <p style={{ color: 'var(--c-muted)' }}>Henter kampe…</p>;
  }

  if (error) {
    return (
      <p role="alert" style={{ color: 'var(--c-err)' }}>
        {error}
      </p>
    );
  }

  return (
    <div>
      {/* Handlingsknapper */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          alignItems: 'center',
        }}
      >
        <button
          className="btn"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? 'Annuller oprettelse' : '+ Opret kamp'}
        </button>

        <button
          className="btn"
          style={{ background: 'var(--c-accent-2)' }}
          onClick={handleBuildKnockout}
          disabled={knockoutBusy}
        >
          {knockoutBusy ? 'Genererer…' : 'Generer knockout-kampe'}
        </button>

        <button
          className="btn btn--ghost"
          onClick={handleBackfill}
          disabled={backfillBusy}
          title="Genopbyg tip-tælleren ud fra alle eksisterende tips"
        >
          {backfillBusy ? 'Kører…' : 'Genopbyg tip-deltagelse'}
        </button>

        <button
          className="btn btn--ghost"
          onClick={handleSendReminders}
          disabled={reminderBusy}
          title="Send e-mail-påmindelser nu (test)"
        >
          {reminderBusy ? 'Sender…' : '✉️ Send påmindelser nu'}
        </button>

        <button
          className="btn btn--ghost"
          onClick={handleTestToMe}
          disabled={reminderBusy}
          title="Send en testmail kun til dig selv med de første 3 spilledage"
        >
          {reminderBusy ? 'Sender…' : '🧪 Testmail til mig'}
        </button>

        {isOwner && (
          <button
            className="btn btn--ghost"
            onClick={handlePrune}
            disabled={pruneBusy}
            title="Slet forældede knockout-kampe med gamle id'er"
          >
            {pruneBusy ? 'Rydder…' : '🧹 Ryd forældede kampe'}
          </button>
        )}
      </div>

      {pruneMsg && (
        <div role="alert" style={{ marginBottom: '1rem', padding: '0.5rem 0.8rem', borderRadius: 8, background: 'var(--c-surface-2, #f0f0f0)', fontSize: '0.88rem' }}>
          {pruneMsg}
        </div>
      )}

      {/* Feedback fra påmindelser */}
      {reminderMsg && (
        <div role="alert" style={{ marginBottom: '1rem', padding: '0.5rem 0.8rem', borderRadius: 8, background: 'var(--c-surface-2, #f0f0f0)', fontSize: '0.88rem' }}>
          {reminderMsg}
        </div>
      )}

      {/* Feedback fra backfill */}
      {backfillMsg && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.5rem 0.8rem',
            borderRadius: 8,
            fontSize: '0.88rem',
            background: backfillMsg.startsWith('Fejl') ? '#fef2f2' : '#f0fdf4',
            color: backfillMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
            border: `1px solid ${backfillMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)'}`,
          }}
        >
          {backfillMsg}
        </div>
      )}

      {/* Feedback fra buildKnockout */}
      {knockoutMsg && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.5rem 0.8rem',
            borderRadius: 8,
            fontSize: '0.88rem',
            background: knockoutMsg.startsWith('Fejl') ? '#fef2f2' : '#f0fdf4',
            color: knockoutMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
            border: `1px solid ${knockoutMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)'}`,
          }}
        >
          {knockoutMsg}
        </div>
      )}

      {/* Opret ny kamp */}
      {showCreate && (
        <MatchCreateForm onClose={() => setShowCreate(false)} />
      )}

      {/* Kampliste */}
      {matches.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen kampe oprettet endnu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {matches.map((match) => {
            const isEditing = editMatchId === match.id;
            const title = `${match.homeTeam ?? match.homePlaceholder ?? '?'} vs ${match.awayTeam ?? match.awayPlaceholder ?? '?'}`;
            const result = match.result
              ? `${match.result.home}–${match.result.away}${match.result.advance ? ` (${match.result.advance})` : ''}`
              : null;

            return (
              <li
                key={match.id}
                style={{
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--c-border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Kampinfo */}
                  <div>
                    <div style={{ fontWeight: 600 }}>{title}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                      {ROUND_LABELS[match.round] ?? match.round}
                      {match.groupName ? ` · Gruppe ${match.groupName}` : ''}
                      {' · '}
                      {formatTimestamp(match.kickoff)}
                    </div>
                    <div style={{ marginTop: 2, fontSize: '0.82rem' }}>
                      <span style={{ color: STATUS_COLORS[match.status] ?? 'var(--c-muted)' }}>
                        {STATUS_LABELS[match.status] ?? match.status}
                      </span>
                      {result && (
                        <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--c-pitch)' }}>
                          {result}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rediger-knap */}
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: '0.82rem', padding: '0.3rem 0.7rem', whiteSpace: 'nowrap' }}
                    onClick={() =>
                      setEditMatchId(isEditing ? null : match.id)
                    }
                  >
                    {isEditing ? 'Luk' : 'Sæt resultat'}
                  </button>
                </div>

                {/* Resultat-formular */}
                {isEditing && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      background: 'var(--c-bg)',
                      borderRadius: 10,
                      border: '1px solid var(--c-border)',
                    }}
                  >
                    <MatchResultForm
                      match={match}
                      onClose={() => setEditMatchId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
