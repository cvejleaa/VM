// Kampe & resultater-fanen i admin-panelet.
// Tilgængelig for global admin og owner.
import { useState } from 'react';
import { useMatches } from './useMatches';
import MatchResultForm from './MatchResultForm';
import MatchCreateForm from './MatchCreateForm';
import SyncHealthBanner from './SyncHealthBanner';
import { callBuildKnockout, callBackfillTipParticipation, callSendTipRemindersNow, callSendTestReminderToMe, callPruneOrphanMatches, callSyncResultsNow, callSyncFixtures, callSyncScorersNow, callSyncMatchDetailsNow, callSyncStandingsNow, callInspectFootballData, clearManualLock, formatTimestamp } from './adminActions';
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

// Viser hvilke football-data.org-felter jeres tier giver adgang til.
function FieldReport({ report, onClose }) {
  const yn = (v) => (v ? '✅' : '❌');
  const Section = ({ title, probe, fields }) => (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
        {title}: {probe?.ok ? '✅ tilgængelig' : `❌ ${probe?.error || 'utilgængelig'}`}
      </div>
      {probe?.ok && fields && (
        <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem', color: 'var(--c-muted)' }}>
          {fields.map(([label, val]) => (
            <li key={label}>{yn(val)} {label}</li>
          ))}
        </ul>
      )}
    </div>
  );

  const matchFields = (md) => [
    ['målscorere + minut', md.hasGoals],
    ['opstillinger (line-ups)', md.hasLineups],
    ['kort (gule/røde)', md.hasBookings],
    ['udskiftninger', md.hasSubstitutions],
    ['dommere', md.hasReferees],
    ['halvlegsstilling', md.hasHalfTime],
    ['straffesparkskonkurrence', md.hasPenaltiesScore],
    ['indbyrdes opgør (h2h)', md.hasHead2Head],
    [`tilskuertal${md.attendance != null ? ` (${md.attendance})` : ''}`, md.attendance != null],
  ];

  const s = report.scorers || {};
  const st = report.standings || {};
  const md = report.matchDetail || {};
  const ref = report.reference || null;
  const emptyWc = s.ok && (s.count ?? 0) === 0;

  return (
    <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--c-pitch)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>🔍 Football-data felt-rapport</h3>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Luk</button>
      </div>

      <div style={{ fontWeight: 800, fontSize: '0.8rem', margin: '0 0 0.3rem' }}>
        VM ({report.competitionCode || 'WC'})
      </div>
      {emptyWc && (
        <div style={{ fontSize: '0.78rem', color: '#92600a', background: '#fffbeb', border: '1px solid var(--c-warn)', borderRadius: 8, padding: '0.4rem 0.6rem', marginBottom: '0.5rem' }}>
          VM er ikke begyndt endnu — derfor er der ingen scorere/kampe at hente.
          Tomme felter her betyder <strong>ikke</strong> at I mangler adgang. Se reference-turneringen nedenfor.
        </div>
      )}
      <Section title="Topscorere (/scorers)" probe={s} fields={[
        [`antal: ${s.count ?? 0}`, (s.count ?? 0) > 0],
        ['assists', s.hasAssists],
        ['straffemål', s.hasPenalties],
        ['nationalitet', s.hasNationality],
      ]} />
      <Section title="Stilling (/standings)" probe={st} fields={[
        [`tabeller: ${st.tableCount ?? 0}`, (st.tableCount ?? 0) > 0],
        ['form (W/D/L)', st.hasForm],
        ['målforskel', st.hasGoalDiff],
      ]} />
      <Section title="Kampdetaljer (/matches/{id})" probe={md} fields={matchFields(md)} />

      {ref && (
        <>
          <div style={{ fontWeight: 800, fontSize: '0.8rem', margin: '0.75rem 0 0.3rem', borderTop: '1px solid var(--c-border)', paddingTop: '0.6rem' }}>
            Reference: {ref.code} (aktiv turnering — viser hvad tieren reelt leverer)
          </div>
          <Section title="Topscorere (/scorers)" probe={ref.scorers} fields={[
            [`antal: ${ref.scorers?.count ?? 0}`, (ref.scorers?.count ?? 0) > 0],
            ['assists', ref.scorers?.hasAssists],
            ['straffemål', ref.scorers?.hasPenalties],
            ['nationalitet', ref.scorers?.hasNationality],
          ]} />
          <Section title="Kampdetaljer (/matches/{id})" probe={ref.matchDetail} fields={matchFields(ref.matchDetail || {})} />
        </>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>
        Tjekket {report.checkedAt ? new Date(report.checkedAt).toLocaleString('da-DK') : '—'}.
      </div>
    </div>
  );
}

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
  const [syncMsg, setSyncMsg] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [inspectReport, setInspectReport] = useState(null);
  const { isOwner } = useAuth();

  async function handleSyncScorers() {
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncScorersNow();
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    setSyncMsg(`Topscorere opdateret: ${d.count ?? 0} spillere${d.top ? ` (fører: ${d.top})` : ''}.`);
  }

  async function handleSyncMatchDetails() {
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncMatchDetailsNow();
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    if (d.reason === 'no-window-matches') { setSyncMsg('Ingen kampe i vinduet lige nu.'); return; }
    setSyncMsg(`Kampdetaljer: ${d.updated ?? 0} opdateret af ${d.checked ?? 0}.`);
  }

  async function handleSyncStandings() {
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncStandingsNow();
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    setSyncMsg(`Stilling opdateret: ${res.data?.tables ?? 0} tabel(ler).`);
  }

  async function handleInspect() {
    setSyncBusy(true); setSyncMsg(''); setInspectReport(null);
    const res = await callInspectFootballData();
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    setInspectReport(res.data);
  }

  async function handleSyncNow(dryRun) {
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncResultsNow({ dryRun });
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    if (d.reason === 'no-window-matches') { setSyncMsg('Ingen kampe i gang lige nu.'); return; }
    setSyncMsg(`${dryRun ? 'Tør-kør' : 'Synk'}: ${d.updated ?? 0} opdateret af ${d.checked ?? 0} (${d.review ?? 0} til tjek).`);
  }

  async function handleSyncFixtures() {
    if (!window.confirm('Map alle vores kampe til football-data.org-id\'er?')) return;
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncFixtures({});
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    setSyncMsg(`Mapping: ${d.mapped ?? 0} nye, ${d.already ?? 0} allerede, ${(d.unmatched?.length ?? 0)} uden match (af ${d.totalFixtures ?? '?'} fixtures hos football-data).`);
  }

  async function handleRestoreAuto(matchId) {
    if (!window.confirm('Gendan automatikken for denne kamp? Auto-synken må så opdatere resultatet igen.')) return;
    try { await clearManualLock(matchId); } catch (e) { window.alert(e.message); }
  }

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

      {/* Resultat-automatik (football-data.org) */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--c-muted)' }}>Auto-resultater:</span>
        <button className="btn btn--ghost btn--sm" onClick={() => handleSyncNow(false)} disabled={syncBusy}
          title="Hent live/afsluttede resultater fra football-data.org nu">
          {syncBusy ? '…' : '⚽ Synk nu'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => handleSyncNow(true)} disabled={syncBusy}
          title="Vis hvad en synk ville ændre, uden at skrive noget">
          🔎 Tør-kør
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncFixtures} disabled={syncBusy}
          title="Map vores kampe til football-data.org-id'er (kør én gang / efter lodtrækning)">
          {"🔗 Map kamp-id'er"}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncScorers} disabled={syncBusy}
          title="Opdater topscorer-listen (Golden Boot) fra football-data.org">
          ⚽ Opdater topscorere
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncMatchDetails} disabled={syncBusy}
          title="Hent mål, kort og opstillinger for kampe i vinduet">
          📋 Opdater kampdetaljer
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncStandings} disabled={syncBusy}
          title="Opdater den officielle stilling (gruppetabeller med form)">
          📊 Opdater stilling
        </button>
        {isOwner && (
          <button className="btn btn--ghost btn--sm" onClick={handleInspect} disabled={syncBusy}
            title="Tjek hvilke felter jeres football-data.org-tier giver adgang til">
            🔍 Tjek football-data felter
          </button>
        )}
      </div>

      {inspectReport && (
        <FieldReport report={inspectReport} onClose={() => setInspectReport(null)} />
      )}

      <SyncHealthBanner />

      {syncMsg && (
        <div role="alert" style={{ marginBottom: '1rem', padding: '0.5rem 0.8rem', borderRadius: 8, fontSize: '0.88rem',
          background: syncMsg.startsWith('Fejl') ? '#fef2f2' : '#f0fdf4',
          color: syncMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
          border: `1px solid ${syncMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)'}` }}>
          {syncMsg}
        </div>
      )}

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
                      {match.manualLock && (
                        <span className="badge badge--yellow" style={{ marginLeft: 8, fontSize: '0.7rem' }}>🔒 Rettet manuelt</span>
                      )}
                      {!match.manualLock && match.resultSource === 'auto' && (
                        <span className="badge badge--muted" style={{ marginLeft: 8, fontSize: '0.7rem' }}>Auto</span>
                      )}
                      {match.needsReview && (
                        <span className="badge badge--red" style={{ marginLeft: 8, fontSize: '0.7rem' }}>Tjek</span>
                      )}
                    </div>
                    {match.manualLock && (
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ marginTop: 4, fontSize: '0.75rem' }}
                        onClick={() => handleRestoreAuto(match.id)}
                        title="Lad automatikken opdatere denne kamp igen"
                      >
                        ↺ Gendan automatik
                      </button>
                    )}
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
