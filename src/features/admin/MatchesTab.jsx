// Kampe & resultater-fanen i admin-panelet.
// Tilgængelig for global admin og owner.
import { useState } from 'react';
import { useMatches } from './useMatches';
import MatchResultForm from './MatchResultForm';
import MatchCreateForm from './MatchCreateForm';
import SyncHealthBanner from './SyncHealthBanner';
import RecapBackfillPanel from './RecapBackfillPanel';
import { callImportKnockout, callBackfillTipParticipation, callSendTipRemindersNow, callSyncResultsNow, callSyncFixtures, callSyncScorersNow, callSyncMatchDetailsNow, callSyncStandingsNow, callInspectMatchRaw, clearManualLock, formatTimestamp } from './adminActions';
import { MATCH_STATUS, ROUNDS } from '../../lib/constants';

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
  const [koPreview, setKoPreview] = useState(null); // dry-run-resultat fra football-data-import
  const [backfillMsg, setBackfillMsg] = useState('');
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  const [reminderBusy, setReminderBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [timeChanges, setTimeChanges] = useState(null); // null=ikke tjekket, []=ingen afvigelser
  const [inspectId, setInspectId] = useState(null); // hvilken kamp vises rådata for
  const [inspectData, setInspectData] = useState(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [inspectErr, setInspectErr] = useState('');

  async function handleInspect(matchId) {
    if (inspectId === matchId) { setInspectId(null); setInspectData(null); setInspectErr(''); return; }
    setInspectId(matchId); setInspectData(null); setInspectErr(''); setInspectBusy(true);
    const res = await callInspectMatchRaw(matchId);
    setInspectBusy(false);
    if (res.ok) setInspectData(res.data);
    else setInspectErr(res.error);
  }

  async function handleCheckTimes() {
    setSyncBusy(true); setSyncMsg(''); setTimeChanges(null);
    const res = await callSyncFixtures({ fixKickoff: true, dryRun: true });
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const changes = res.data?.kickoffChanges ?? [];
    setTimeChanges(changes);
    setSyncMsg(changes.length === 0
      ? 'Alle kamptider stemmer med football-data. 👍'
      : `${changes.length} kamp(e) afviger fra football-data — se nedenfor.`);
  }

  async function handleApplyTimes() {
    if (!window.confirm('Ret kamptiderne til football-data?')) return;
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncFixtures({ fixKickoff: true, dryRun: false });
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    setSyncMsg(`Rettede ${res.data?.kickoffChanges?.length ?? 0} kamptid(er).`);
    setTimeChanges(null);
  }

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

  async function handleSyncNow() {
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncResultsNow({ dryRun: false, full: false });
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    if (d.reason === 'no-window-matches') { setSyncMsg('Ingen kampe i gang lige nu.'); return; }
    if (d.reason === 'no-unfinished-matches') { setSyncMsg('Ingen uafsluttede kampe at synke.'); return; }
    setSyncMsg(`Synk: ${d.updated ?? 0} opdateret af ${d.checked ?? 0} (${d.review ?? 0} til tjek).`);
  }

  async function handleSyncFull() {
    setSyncBusy(true); setSyncMsg('');
    const res = await callSyncResultsNow({ dryRun: false, full: true });
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    if (d.reason === 'no-unfinished-matches') { setSyncMsg('Ingen uafsluttede kampe at synke.'); return; }
    setSyncMsg(`Fuld synk: ${d.updated ?? 0} opdateret af ${d.checked ?? 0} (${d.review ?? 0} til tjek).`);
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

  async function handleBackfill() {
    if (!window.confirm('Genopbyg tip-deltagelse ud fra alle eksisterende tips?')) return;
    setBackfillBusy(true);
    setBackfillMsg('');
    const res = await callBackfillTipParticipation();
    setBackfillBusy(false);
    setBackfillMsg(res.ok ? (res.data?.message ?? 'Backfill færdig!') : `Fejl: ${res.error}`);
  }

  async function handleKnockoutPreview() {
    setKnockoutBusy(true); setKnockoutMsg('');
    const res = await callImportKnockout({ dryRun: true });
    setKnockoutBusy(false);
    if (!res.ok) { setKoPreview(null); setKnockoutMsg(`Fejl: ${res.error}`); return; }
    setKoPreview(res.data);
    if (res.data?.guardBlocked) {
      setKnockoutMsg('Football-data har ingen knockout-kampe endnu — intet slettes. Prøv igen når bracketten er sat.');
    }
  }

  async function handleKnockoutApply() {
    const c = koPreview?.counts || {};
    if (!window.confirm(
      `Anvend football-data-importen?\n\nOpret: ${c.create ?? 0}\nOpdater: ${c.update ?? 0}\nSlet: ${c.delete ?? 0}\n\nDette overskriver knockout-kampene (kan ikke fortrydes).`,
    )) return;
    setKnockoutBusy(true); setKnockoutMsg('');
    const res = await callImportKnockout({ dryRun: false });
    setKnockoutBusy(false);
    if (!res.ok) { setKnockoutMsg(`Fejl: ${res.error}`); return; }
    setKoPreview(null);
    const a = res.data?.applied || {};
    setKnockoutMsg(`Importeret fra football-data: ${a.create ?? 0} oprettet, ${a.update ?? 0} opdateret, ${a.delete ?? 0} slettet.`);
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
          onClick={handleKnockoutPreview}
          disabled={knockoutBusy}
          title="Hent de rigtige knockout-kampe fra football-data (forhåndsvis først)"
        >
          {knockoutBusy ? 'Henter…' : '🔄 Importér knockout (football-data)'}
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

      </div>

      {/* Resultat-automatik (football-data.org) */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--c-muted)' }}>Auto-resultater:</span>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncNow} disabled={syncBusy}
          title="Hent live/afsluttede resultater fra football-data.org nu">
          {syncBusy ? '…' : '⚽ Synk nu'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncFull} disabled={syncBusy}
          title="Tjek ALLE uafsluttede kampe mod football-data.org — uanset tidspunkt. Brug hvis en kamp hænger (fx afbrudt og genoptaget)">
          {syncBusy ? '…' : '🔄 Fuld synk'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleSyncFixtures} disabled={syncBusy}
          title="Map vores kampe til football-data.org-id'er (kør efter lodtrækning / når knockout-kampe får hold)">
          {"🔗 Map kamp-id'er"}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={handleCheckTimes} disabled={syncBusy}
          title="Sammenlign vores kamptider med football-data.org og find afvigelser">
          🕐 Tjek kamptider
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
      </div>

      <SyncHealthBanner />

      <RecapBackfillPanel />

      {syncMsg && (
        <div role="alert" style={{ marginBottom: '1rem', padding: '0.5rem 0.8rem', borderRadius: 8, fontSize: '0.88rem',
          background: syncMsg.startsWith('Fejl') ? '#fef2f2' : '#f0fdf4',
          color: syncMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
          border: `1px solid ${syncMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)'}` }}>
          {syncMsg}
        </div>
      )}

      {timeChanges && timeChanges.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--c-warn)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Afvigende kamptider ({timeChanges.length})</strong>
            <button className="btn btn--sm" onClick={handleApplyTimes} disabled={syncBusy}>
              ✅ Ret til football-data
            </button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
            {timeChanges.map((c) => (
              <li key={c.id} style={{ padding: '0.25rem 0', borderTop: '1px solid var(--c-border)' }}>
                <strong>{c.home}–{c.away}</strong>:{' '}
                <span style={{ color: 'var(--c-err)' }}>{new Date(c.fromISO).toLocaleString('da-DK')}</span>
                {' → '}
                <span style={{ color: 'var(--c-ok)' }}>{new Date(c.toISO).toLocaleString('da-DK')}</span>
              </li>
            ))}
          </ul>
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

      {/* Feedback fra knockout-import */}
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

      {/* Forhåndsvisning af football-data-knockout-import (dry-run) */}
      {koPreview && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 0.9rem', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-2, #f7f7f7)', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
            Forhåndsvisning (football-data, sæson {koPreview.season})
          </div>
          <div style={{ color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
            {koPreview.fdTotal} kampe hentet · {koPreview.learnedTeams} hold genkendt · {koPreview.desiredKnockout} knockout-kampe.
            {' '}Opret <strong>{koPreview.counts.create}</strong>, opdater <strong>{koPreview.counts.update}</strong>, slet <strong>{koPreview.counts.delete}</strong>.
          </div>
          {koPreview.toDelete?.length > 0 && (
            <div style={{ marginBottom: '0.4rem' }}>
              <span style={{ color: 'var(--c-err)' }}>Slettes:</span> {koPreview.toDelete.join(', ')}
            </div>
          )}
          {[...(koPreview.toCreate || []), ...(koPreview.toUpdate || [])].length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.15rem', maxHeight: 220, overflow: 'auto' }}>
              {[...(koPreview.toCreate || []), ...(koPreview.toUpdate || [])].map((d) => (
                <li key={d.id} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: 'var(--c-muted)' }}>{ROUND_LABELS[d.round] || d.round}</span>{' '}
                  {d.homeTeam || '—'} – {d.awayTeam || '—'}{' '}
                  <span style={{ color: 'var(--c-muted)', fontSize: '0.78rem' }}>({d.status})</span>
                </li>
              ))}
            </ul>
          )}
          {!koPreview.guardBlocked && (koPreview.counts.create + koPreview.counts.update + koPreview.counts.delete) > 0 && (
            <button className="btn btn--primary btn--sm" onClick={handleKnockoutApply} disabled={knockoutBusy}>
              {knockoutBusy ? 'Anvender…' : 'Anvend ændringer'}
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => setKoPreview(null)} style={{ marginLeft: '0.4rem' }}>Luk</button>
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

                  {/* Knapper */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {match.externalId && (
                      <button
                        className="btn btn--ghost"
                        style={{ fontSize: '0.82rem', padding: '0.3rem 0.7rem', whiteSpace: 'nowrap' }}
                        onClick={() => handleInspect(match.id)}
                        title="Vis den præcise football-data for kampen (score-opdeling + mål)"
                      >
                        {inspectId === match.id ? 'Skjul rådata' : '🔎 Rådata'}
                      </button>
                    )}
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
                </div>

                {/* Rådata fra football-data.org */}
                {inspectId === match.id && (
                  <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: 'var(--c-bg)', borderRadius: 10, border: '1px solid var(--c-border)' }}>
                    {inspectBusy && <div style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>Henter fra football-data.org…</div>}
                    {inspectErr && <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--c-err)' }}>Fejl: {inspectErr}</div>}
                    {inspectData && <RawDataView data={inspectData} />}
                  </div>
                )}

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

// Lille hjælper: vis et score-delfelt ({home,away}) eller "—".
function pair(p) {
  return p && p.home != null ? `${p.home}–${p.away}` : '—';
}

// Viser den præcise football-data for én kamp: score-opdeling, mål-tidslinje og
// hvad VI udleder (90 min + tillægstid, uden forlænget tid/straffe).
function RawDataView({ data }) {
  const s = data.score || {};
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const cell = { padding: '0.15rem 0.5rem 0.15rem 0', whiteSpace: 'nowrap' };
  const minuteLabel = (g) => (g.minute == null
    ? 'straffe' // straffesparkskonkurrence (intet minut)
    : `${g.minute}${g.injuryTime ? `+${g.injuryTime}` : ''}'`);
  return (
    <div style={{ fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        football-data ({data.teams?.home ?? '?'}–{data.teams?.away ?? '?'}) · status {data.providerStatus ?? '?'}
      </div>

      <table style={{ borderCollapse: 'collapse', marginBottom: 6 }}>
        <tbody>
          <tr><td style={cell}>Halvleg</td><td style={cell}><strong>{pair(s.halfTime)}</strong></td>
            <td style={cell}>Ordinær tid (regularTime)</td><td style={cell}><strong>{pair(s.regularTime)}</strong></td></tr>
          <tr><td style={cell}>Fuld tid (fullTime)</td><td style={cell}><strong>{pair(s.fullTime)}</strong></td>
            <td style={cell}>Forlænget tid (extraTime)</td><td style={cell}><strong>{pair(s.extraTime)}</strong></td></tr>
          <tr><td style={cell}>Straffe (penalties)</td><td style={cell}><strong>{pair(s.penalties)}</strong></td>
            <td style={cell}>Vinder / varighed</td><td style={cell}><strong>{s.winner ?? '—'}</strong> / {s.duration ?? '—'}</td></tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, margin: '4px 0 2px' }}>Mål ({goals.length})</div>
      {goals.length === 0 ? (
        <div style={{ color: 'var(--c-muted)' }}>Ingen mål i datafeedet.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {goals.map((g, i) => (
            <li key={i} style={{ padding: '1px 0' }}>
              <code>{minuteLabel(g)}</code>{' · '}
              <strong>{g.side === 'home' ? (data.teams?.home ?? 'hjemme') : g.side === 'away' ? (data.teams?.away ?? 'ude') : '?'}</strong>
              {g.type && g.type !== 'REGULAR' ? ` (${g.type})` : ''}
              {g.scorer ? ` — ${g.scorer}` : ''}
              {g.minute != null && Number(g.minute) > 90 ? '  ⟵ forlænget tid (tæller ikke)' : ''}
              {g.minute == null ? '  ⟵ straffe (tæller ikke)' : ''}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--c-border)' }}>
        <div>Vi udleder (90 min + tillægstid): <strong>{data.derived?.ninetyMinutes ? `${data.derived.ninetyMinutes.home}–${data.derived.ninetyMinutes.away}` : '— (afventer mål-data)'}</strong></div>
        <div>Går videre: <strong>{data.derived?.advance ?? '—'}</strong></div>
        <div style={{ color: 'var(--c-muted)' }}>Gemt hos os: {pair(data.stored?.result)} {data.stored?.result?.advance ? `(videre: ${data.stored.result.advance})` : ''} · status {data.stored?.status ?? '?'}{data.stored?.manualLock ? ' · 🔒 manuelt låst' : ''}</div>
      </div>
    </div>
  );
}
