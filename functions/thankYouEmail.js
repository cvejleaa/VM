'use strict';
// ---------------------------------------------------------------------------
// thankYouEmail.js — bygger den afsluttende takke-mail (ren HTML-streng) og
// beregner liga-slutstillinger. Ingen Firestore/IO; index.js henter data og
// kalder render. Mail-sikker HTML: tabeller + inline styles, flag via flagcdn.
// ---------------------------------------------------------------------------
const { teamName, flagUrl } = require('./teams');
const { leagueTotal } = require('./leagueRecap');

// Scoring-normalisering — server-side spejl af frontendens leagueFormat.js, så
// hver ligas AKTIVEREDE dele bruges (og gamle `format`-ligaer håndteres korrekt).
const DEFAULT_SCORING = { group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: false };
const LEAGUE_FORMAT = { FULL: 'full', BONUS_ONLY: 'bonusOnly', KNOCKOUT_ONLY: 'knockoutOnly', GROUP_ONLY: 'groupOnly', DOUBLE_KNOCKOUT: 'doubleKnockout' };

function fromLegacyFormat(format) {
  switch (format) {
    case LEAGUE_FORMAT.BONUS_ONLY: return { group: false, knockout: false, bonus: true, leagueBonus: true, doubleKnockout: false };
    case LEAGUE_FORMAT.KNOCKOUT_ONLY: return { group: false, knockout: true, bonus: false, leagueBonus: true, doubleKnockout: false };
    case LEAGUE_FORMAT.GROUP_ONLY: return { group: true, knockout: false, bonus: false, leagueBonus: true, doubleKnockout: false };
    case LEAGUE_FORMAT.DOUBLE_KNOCKOUT: return { group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: true };
    case LEAGUE_FORMAT.FULL:
    default: return { ...DEFAULT_SCORING };
  }
}

/** Ligaens faktiske scoring: ny `scoring` (udfyldt med defaults) ellers gammelt `format`. */
function normalizeScoring(league) {
  if (league && league.scoring && typeof league.scoring === 'object') {
    return { ...DEFAULT_SCORING, ...league.scoring };
  }
  if (league && league.format) return fromLegacyFormat(league.format);
  return { ...DEFAULT_SCORING };
}

const C = {
  pitch: '#15803d', pitch2: '#16a34a', gold: '#c99a2e', goldSoft: '#f6ecd0',
  ink: '#14261c', muted: '#5b6b60', line: '#e2ebe3', page: '#eef3ee', you: '#eaf5ee',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lille flag-<img> for en holdkode (tom streng hvis ukendt). */
function flag(code, h = 14) {
  const url = flagUrl(code, 40);
  if (!url) return '';
  return `<img src="${url}" width="${Math.round(h * 1.5)}" height="${h}" alt="" style="vertical-align:middle;border-radius:2px;border:0;margin-right:5px">`;
}

/** Land med flag + dansk navn. */
function nation(code, h = 14) {
  if (!code) return '';
  return `${flag(code, h)}${esc(teamName(code))}`;
}

/**
 * Beregn en ligas slutstilling ud fra medlemmernes point og ligaens scoring.
 * Liga-bonus lægges til når ligaen bruger den (scoring.leagueBonus) — samme
 * grundlag som app'ens leaderboard (leagueScore).
 * @param {object} league  { name, memberUids, scoring }
 * @param {Object<string,object>} membersById  uid → { displayName, groupPoints, knockoutPoints, bonusPoints }
 * @param {Object<string,number>} [leagueBonusByUid]  uid → liga-bonuspoint
 * @returns {{ name, memberCount, rows: Array<{uid,name,points,rank}> }}
 */
function leagueStandings(league, membersById, leagueBonusByUid = {}) {
  const scoring = normalizeScoring(league);
  const useLeagueBonus = scoring.leagueBonus === true;
  const uids = Array.isArray(league && league.memberUids) ? league.memberUids : [];
  const sorted = uids
    .map((uid) => {
      const u = membersById[uid];
      if (!u) return null;
      let points = leagueTotal(u, scoring);
      if (useLeagueBonus) points += Number(leagueBonusByUid[uid] || 0);
      return { uid, name: u.displayName || 'Spiller', points };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'));

  // Standard konkurrence-rangering ("1224"): lige mange point → samme, bedste
  // placering. Næste placering springer frem svarende til antal delinger.
  let prevPoints = null;
  let prevRank = 0;
  const rows = sorted.map((r, i) => {
    const rank = (prevPoints !== null && r.points === prevPoints) ? prevRank : i + 1;
    prevPoints = r.points;
    prevRank = rank;
    return { ...r, rank };
  });
  return { name: (league && league.name) || 'Liga', memberCount: rows.length, rows };
}

// ── HTML-fragmenter ─────────────────────────────────────────────────────────
function statTile(num, lbl) {
  return `<td width="33%" style="padding:5px" align="center">
    <div style="background:#f6faf7;border:1px solid ${C.line};border-radius:12px;padding:12px 6px">
      <div style="font-size:21px;font-weight:800;color:${C.ink}">${esc(num)}</div>
      <div style="font-size:11px;color:${C.muted};margin-top:2px">${esc(lbl)}</div>
    </div></td>`;
}

function factRow(k, v) {
  return `<tr>
    <td style="padding:8px 0;border-top:1px solid ${C.line};font-size:13.5px;color:${C.muted}">${k}</td>
    <td style="padding:8px 0;border-top:1px solid ${C.line};font-size:13.5px;font-weight:700;text-align:right;white-space:nowrap">${v}</td>
  </tr>`;
}

function chip(role, p) {
  const nm = esc(p && p.name ? p.name : '—');
  const co = p && p.code
    ? `${flag(p.code, 12)}<span style="color:#eafff0"> ${esc(teamName(p.code))}</span>`
    : '';
  return `<div style="color:#fff;text-align:center;padding:0 3px">
    <div style="width:34px;height:34px;line-height:34px;border-radius:50%;background:rgba(255,255,255,0.94);color:${C.pitch};font-weight:800;font-size:12px;margin:0 auto 5px;box-shadow:0 1px 3px rgba(0,0,0,0.28)">${role}</div>
    <div style="font-size:12px;font-weight:700;line-height:1.2;text-shadow:0 1px 2px rgba(0,0,0,0.55)">${nm}</div>
    <div style="font-size:10px;margin-top:2px;white-space:nowrap">${co}</div>
  </div>`;
}

// Én kæde som fuld-bredde tabel med jævnt fordelte celler (så 3- og 4-mands-
// rækker begge centreres pænt uanset antal).
function pitchRow(players, role) {
  if (!players || players.length === 0) return '';
  const w = Math.floor(100 / players.length);
  const cells = players.map((p) => `<td width="${w}%" align="center" valign="top" style="padding:11px 2px">${chip(role, p)}</td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function leagueBlock(std, youUid) {
  const rows = std.rows.map((r) => {
    const isYou = r.uid === youUid;
    const isWin = r.rank === 1;
    const bg = isWin ? C.goldSoft : isYou ? C.you : '#ffffff';
    const weight = isWin || isYou ? '700' : '400';
    const rankCell = MEDALS[r.rank] || String(r.rank);
    const youTag = isYou ? ` <span style="color:${C.pitch};font-size:11px;font-weight:700">· dig</span>` : '';
    return `<tr>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};background:${bg};text-align:right;width:1%;white-space:nowrap;font-weight:${weight}">${rankCell}</td>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};background:${bg};font-size:13.5px;font-weight:${weight}">${esc(r.name)}${youTag}</td>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};background:${bg};text-align:right;font-weight:700;white-space:nowrap">${r.points}</td>
    </tr>`;
  }).join('');
  return `<div style="border:1px solid ${C.line};border-radius:12px;overflow:hidden;margin-top:16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr><td colspan="3" style="padding:11px 14px;background:#f6faf7;border-bottom:1px solid ${C.line};font-size:14.5px;font-weight:700">
        ${esc(std.name)} <span style="font-size:11.5px;color:${C.muted};font-weight:500">· ${std.memberCount} deltagere</span>
      </td></tr>
      ${rows}
    </table></div>`;
}

// Finale-linje: "vandt 1–0 efter forlænget spilletid over X" / "vandt 1–1 (4–3
// på straffe) efter forlænget spilletid over X" / "vandt 2–1 over X".
function championLine(c) {
  const over = `over ${esc(teamName(c.runnerUp))}`;
  const et = c.extraTime ? ' efter forlænget spilletid' : '';
  if (c.decidedOnPenalties && c.penalties) {
    return `Finale: vandt ${c.champScore}–${c.otherScore} (${c.penalties.for}–${c.penalties.against} på straffe)${et} ${over}`;
  }
  return `Finale: vandt ${esc(c.score)}${et} ${over}`;
}

function section(title, subtitle) {
  return `<h2 style="font-family:Georgia,serif;font-size:18px;margin:30px 0 2px;color:${C.pitch}">${title}</h2>
    ${subtitle ? `<p style="margin:0 0 12px;font-size:12.5px;color:${C.muted}">${esc(subtitle)}</p>` : ''}`;
}

/**
 * Byg hele takke-mailens HTML.
 * @param {object} data
 * @param {string} data.displayName
 * @param {object|null} data.champion  fra computeChampion
 * @param {object|null} data.boot      fra computeGoldenBoot
 * @param {object} data.facts          fra computeFacts
 * @param {object|null} data.team      fra computeTeamOfTournament
 * @param {Array} data.leagues         [{ name, memberCount, rows }] (allerede standings)
 * @param {string} data.youUid
 * @param {string} [data.appUrl]
 * @returns {string}
 */
function renderThankYouEmail({ displayName, champion, boot, facts, team, leagues, youUid, appUrl = 'https://vm.vejleaa.dk' }) {
  const f = facts || {};
  // Minut-label for hurtigste mål (minut 0 vises som 1' — første minut).
  const fastLabel = (r) => {
    if (!r) return '';
    if (r.injuryTime) return `${r.minute}+${r.injuryTime}'`;
    return `${Math.max(1, Number(r.minute) || 0)}'`;
  };

  // Verdensmester-banner
  const champHtml = champion ? `
    <div style="margin:22px 0 6px;text-align:center;background:linear-gradient(160deg,#f9edc8,#f0d59b);border:1px solid #e6cd8f;border-radius:14px;padding:22px 20px">
      <div style="font-size:34px;line-height:1">🏆</div>
      <div style="font-size:11.5px;letter-spacing:2px;text-transform:uppercase;color:${C.gold};font-weight:800;margin:8px 0 2px">Verdensmester 2026</div>
      <div style="font-family:Georgia,serif;font-size:25px;font-weight:700;color:#4a3708">${nation(champion.champion, 22)}</div>
      <div style="font-size:13px;color:#7a5c18;margin-top:6px">${championLine(champion)}</div>
    </div>` : '';

  // Fakta
  const factsList = [
    f.fastest ? factRow('⚡ Hurtigste mål', `${nation(f.fastest.code, 13)}${f.fastest.scorer ? ` · ${esc(f.fastest.scorer)}` : ''} · ${fastLabel(f.fastest)}`) : '',
    f.biggestWin ? factRow('💥 Største sejr', `${nation(f.biggestWin.winner, 13)} ${esc(f.biggestWin.score)} ${esc(teamName(f.biggestWin.loser))}`) : '',
    f.highest ? factRow('🥅 Mål-rigeste kamp', `${nation(f.highest.home, 13)} ${esc(f.highest.score)} ${esc(teamName(f.highest.away))}`) : '',
    f.topNation ? factRow('🎯 Mest scorende hold', `${nation(f.topNation.code, 13)} · ${f.topNation.goals} mål`) : '',
    f.comeback ? factRow('🔄 Største comeback', `${nation(f.comeback.team, 13)} (vendte ${f.comeback.deficit} mål bagud → ${esc(f.comeback.score)})`) : '',
  ].filter(Boolean).join('');

  const factsHtml = `${section('📊 Turneringen i tal', 'Hele slutrunden, kort fortalt.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>${statTile(f.played || 0, 'kampe')}${statTile(f.totalGoals || 0, 'mål')}${statTile(f.goalsPerMatch || 0, 'mål pr. kamp')}</tr>
      <tr>${statTile(f.penalties || 0, 'straffemål')}${statTile(f.own || 0, 'selvmål')}${statTile(f.yellow || 0, 'gule kort')}</tr>
    </table>
    ${factsList ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px">${factsList}</table>` : ''}`;

  // Golden Boot
  const bootHtml = boot ? `${section('👟 Golden Boot', 'Turneringens mest scorende spiller.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f6faf7;border:1px solid ${C.line};border-radius:12px">
      <tr>
        <td width="56" style="padding:14px 0 14px 16px"><div style="width:44px;height:44px;line-height:44px;text-align:center;font-size:24px;background:${C.goldSoft};border:1px solid #ecd9a6;border-radius:50%">👟</div></td>
        <td style="padding:14px 12px">
          <div style="font-size:16px;font-weight:800">${esc(boot.name)} ${boot.code ? flag(boot.code, 13) : ''}</div>
          <div style="font-size:12px;color:${C.muted};margin-top:1px">${boot.code ? esc(teamName(boot.code)) : ''}${boot.assists ? ` · ${boot.assists} assists` : ''}</div>
        </td>
        <td align="center" style="padding:14px 16px 14px 0"><div style="font-size:26px;font-weight:800;color:${C.pitch}">${boot.goals}</div><div style="font-size:10.5px;color:${C.muted};text-transform:uppercase">mål</div></td>
      </tr>
    </table>` : '';

  // Turneringens hold — lodret bane (angreb øverst → målmand nederst).
  let teamHtml = '';
  if (team) {
    teamHtml = `${section(`🏆 Turneringens hold <span style="display:inline-block;background:${C.goldSoft};color:#7a5a12;border:1px solid #ecd9a6;border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:700;vertical-align:middle">${esc(team.formation)} · min. 3 kampe</span>`, 'Kåret ud fra FIFA’s power-index over hele turneringen.')}
      <div style="background:linear-gradient(180deg,#166534,#16a34a);border-radius:14px;padding:10px 6px;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.18)">
        ${pitchRow(team.forwards, 'AN')}
        ${pitchRow(team.midfielders, 'MB')}
        ${pitchRow(team.defenders, 'FO')}
        ${team.gk ? pitchRow([team.gk], 'MÅ') : ''}
      </div>`;
  }

  // Ligaer
  const leaguesHtml = (leagues && leagues.length)
    ? `${section('🥇 Dine ligaer', 'Sådan endte slutstillingen dér, hvor du var med.')}
       ${leagues.map((l) => leagueBlock(l, youUid)).join('')}`
    : `${section('🥇 Dine ligaer', '')}<p style="font-size:13.5px;color:${C.muted}">Du var ikke medlem af en liga i denne turnering.</p>`;

  return `<!DOCTYPE html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid ${C.line};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink};line-height:1.55">
  <tr><td style="background:linear-gradient(160deg,#14532d,#15803d 55%,#16a34a);padding:32px 30px 28px;text-align:center;color:#fff">
    <div style="font-size:38px;line-height:1">🏆</div>
    <div style="font-family:Georgia,serif;font-size:25px;margin:10px 0 4px">Tak fordi du var med til VM 2026</div>
    <div style="font-size:13px;color:#d8f0df;letter-spacing:0.3px">SLUTFLØJT · FODBOLD-VM 2026</div>
    <div style="width:46px;height:3px;background:${C.gold};border-radius:2px;margin:14px auto 0"></div>
  </td></tr>
  <tr><td style="padding:26px 30px 4px">
    <p style="font-size:15.5px;margin:0 0 6px">Kære <strong>${esc(displayName || 'spiller')}</strong>,</p>
    <p style="margin:0 0 4px;color:${C.muted};font-size:14px">Så er der fløjtet af til den sidste kamp, og dermed også til vores tippe-dyst. Tak fordi du var med hele vejen — for hvert tip, hver diskussion og hver aften foran skærmen. Her er et lille tilbageblik.</p>
    ${champHtml}
    ${factsHtml}
    ${bootHtml}
    ${teamHtml}
    ${leaguesHtml}
  </td></tr>
  <tr><td style="padding:22px 30px 26px">
    <p style="font-size:14px;margin:8px 0 0">Tak for en fantastisk turnering — for kampene, for konkurrencen og for det gode selskab undervejs. 🌍⚽</p>
    <p style="font-family:Georgia,serif;font-size:15px;color:${C.pitch};margin:12px 0 0">Vi ses måske til næste slutrunde!</p>
    <p style="color:${C.muted};font-size:13px;margin:6px 0 0">— VM 2026 Tip</p>
  </td></tr>
  <tr><td style="padding:18px 30px 24px;text-align:center;font-size:11.5px;color:${C.muted};border-top:1px solid ${C.line};background:#f8fbf9">
    Du modtager denne mail, fordi du deltog i VM 2026 Tip.<br>
    <a href="${esc(appUrl)}" style="color:${C.pitch}">vm.vejleaa.dk</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

module.exports = { leagueStandings, renderThankYouEmail, normalizeScoring, esc };
