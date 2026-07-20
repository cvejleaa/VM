'use strict';
// ---------------------------------------------------------------------------
// tournamentSummary.js — rene funktioner der udleder turnerings-tilbageblikket
// (verdensmester, Golden Boot, fakta og Turneringens hold) fra kamp-dokumenter.
// Spejler frontendens statsUtils, men uafhængigt og server-testbart. Bruges af
// takke-mailen. Ingen Firestore/IO her.
// ---------------------------------------------------------------------------

/** Kun kampe med et gyldigt resultat. */
function finishedWithResult(matches) {
  return (matches || []).filter((m) => m && m.result);
}
const flipS = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : s);

/** Kickoff i ms — håndterer Firestore Timestamp, {_seconds} og rå kickoffMs. */
function kickoffMs(m) {
  if (!m) return 0;
  if (typeof m.kickoffMs === 'number') return m.kickoffMs;
  const k = m.kickoff;
  if (k && typeof k.toDate === 'function') return k.toDate().getTime();
  if (k && typeof k._seconds === 'number') return k._seconds * 1000;
  return 0;
}

/**
 * Verdensmesteren: vinderen af finalen (round === 'final'). Nyeste finale hvis
 * flere. Vinder = result.advance (holdkode) ellers 90-min-scoren. Returnerer
 * null hvis der ingen afgjort finale er.
 */
function computeChampion(matches) {
  const finals = finishedWithResult(matches).filter((m) => m.round === 'final');
  if (finals.length === 0) return null;
  const m = finals.slice().sort((a, b) => kickoffMs(b) - kickoffMs(a))[0];
  const rh90 = Number(m.result.home) || 0;
  const ra90 = Number(m.result.away) || 0;

  // Fuld stilling inkl. forlænget spilletid: tælles fra mål-feedet (som også
  // indeholder ET-mål; straffesparkskonkurrencen er filtreret fra i mapningen).
  // Falder tilbage til 90-min-resultatet hvis mål-feedet mangler.
  const goals = Array.isArray(m.details && m.details.goals) ? m.details.goals : [];
  let hg = 0; let ag = 0; let maxMinute = 0;
  for (const g of goals) {
    const s = g.type === 'OWN' ? flipS(g.side) : g.side;
    if (s === 'home') hg += 1; else if (s === 'away') ag += 1;
    if (g.minute != null && g.minute > maxMinute) maxMinute = g.minute;
  }
  const hasFeed = goals.length > 0;
  const rh = hasFeed ? hg : rh90;
  const ra = hasFeed ? ag : ra90;

  let winner = m.result.advance || null;
  if (!winner) {
    if (rh > ra) winner = m.homeTeam;
    else if (ra > rh) winner = m.awayTeam;
    else return null; // uafgjort uden advance → kan ikke afgøres
  }
  const runnerUp = winner === m.homeTeam ? m.awayTeam : m.homeTeam;
  const champScore = winner === m.homeTeam ? rh : ra;
  const otherScore = winner === m.homeTeam ? ra : rh;
  const pens = m.result.penalties && m.result.penalties.home != null
    ? { for: winner === m.homeTeam ? m.result.penalties.home : m.result.penalties.away,
        against: winner === m.homeTeam ? m.result.penalties.away : m.result.penalties.home }
    : null;
  const decidedOnPenalties = champScore === otherScore && !!pens;
  // Forlænget spilletid: mål efter 90. min, eller 90-min var lige men det blev afgjort.
  const extraTime = maxMinute > 90 || (rh90 === ra90 && (rh !== ra || decidedOnPenalties));
  return {
    champion: winner,
    runnerUp,
    score: `${champScore}–${otherScore}`,
    champScore,
    otherScore,
    penalties: pens,
    decidedOnPenalties,
    extraTime,
  };
}

/**
 * Golden Boot: mest scorende spiller over de afsluttede kampe (fra
 * details.playerStats). Tiebreak: assists, derefter navn. Null hvis ingen mål.
 */
function computeGoldenBoot(matches) {
  const agg = {};
  for (const m of finishedWithResult(matches)) {
    const ps = m.details && m.details.playerStats;
    if (!ps || typeof ps !== 'object') continue;
    for (const [pid, p] of Object.entries(ps)) {
      if (!p || !p.name) continue;
      const code = p.side === 'home' ? m.homeTeam : p.side === 'away' ? m.awayTeam : null;
      const a = (agg[pid] = agg[pid] || { id: pid, name: p.name, code: code || null, goals: 0, assists: 0 });
      const s = p.stats || {};
      a.goals += Number(s.Goals) || 0;
      a.assists += Number(s.Assists) || 0;
      if (!a.code && code) a.code = code;
    }
  }
  const list = Object.values(agg)
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, 'da'));
  return list[0] || null;
}

/**
 * Turnerings-fakta: kampe, mål, mål/kamp, straffe-/selvmål, kort, mest scorende
 * nation, samt rekorder (hurtigste mål, største sejr, mål-rigeste kamp, comeback).
 */
function computeFacts(matches) {
  const finished = finishedWithResult(matches);
  let totalGoals = 0; let penalties = 0; let own = 0; let yellow = 0; let red = 0;
  const nationGoals = {};
  let fastest = null; let biggestWin = null; let highest = null; let comeback = null;

  for (const m of finished) {
    for (const b of (Array.isArray(m.details && m.details.bookings) ? m.details.bookings : [])) {
      if (b.card === 'YELLOW') yellow += 1;
      else if (b.card === 'RED' || b.card === 'YELLOW_RED') red += 1;
    }
    const rh = Number(m.result.home) || 0;
    const ra = Number(m.result.away) || 0;
    const total = rh + ra;
    if (!highest || total > highest.total) {
      highest = { home: m.homeTeam, away: m.awayTeam, score: `${rh}–${ra}`, total };
    }
    const margin = Math.abs(rh - ra);
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) {
      const winnerHome = rh > ra;
      biggestWin = {
        winner: winnerHome ? m.homeTeam : m.awayTeam,
        loser: winnerHome ? m.awayTeam : m.homeTeam,
        score: `${Math.max(rh, ra)}–${Math.min(rh, ra)}`,
        margin,
      };
    }
    const goals = Array.isArray(m.details && m.details.goals) ? m.details.goals : [];
    for (const g of goals) {
      totalGoals += 1;
      if (g.type === 'PENALTY') penalties += 1;
      else if (g.type === 'OWN') own += 1;
      const s = g.type === 'OWN' ? flipS(g.side) : g.side;
      const code = s === 'home' ? m.homeTeam : s === 'away' ? m.awayTeam : null;
      if (code) nationGoals[code] = (nationGoals[code] || 0) + 1;
      if (g.minute != null) {
        const key = g.minute * 100 + (g.injuryTime || 0);
        if (!fastest || key < fastest.key) {
          fastest = { key, minute: g.minute, injuryTime: g.injuryTime || 0, scorer: g.scorer || null, code };
        }
      }
    }
    if (rh !== ra && goals.length) {
      const winner = rh > ra ? 'home' : 'away';
      const seq = goals.slice().sort((x, y) => ((x.minute == null ? 999 : x.minute) - (y.minute == null ? 999 : y.minute)) || ((x.injuryTime || 0) - (y.injuryTime || 0)));
      let h = 0; let a = 0; let maxDef = 0;
      for (const g of seq) {
        const s = g.type === 'OWN' ? flipS(g.side) : g.side;
        if (s === 'home') h += 1; else if (s === 'away') a += 1;
        const d = winner === 'home' ? a - h : h - a;
        if (d > maxDef) maxDef = d;
      }
      if (maxDef > 0 && (!comeback || maxDef > comeback.deficit)) {
        comeback = { team: winner === 'home' ? m.homeTeam : m.awayTeam, deficit: maxDef, score: `${rh}–${ra}` };
      }
    }
  }
  let topNation = null;
  for (const [code, g] of Object.entries(nationGoals)) {
    if (!topNation || g > topNation.goals) topNation = { code, goals: g };
  }
  const played = finished.length;
  return {
    played,
    totalGoals,
    goalsPerMatch: played ? Math.round((totalGoals / played) * 10) / 10 : 0,
    penalties,
    own,
    yellow,
    red,
    topNation,
    fastest,
    biggestWin,
    highest,
    comeback,
  };
}

/** Turneringens målmand (nr. 1 på gennemsnitlig 'defending' fra power-index). */
function bestGoalkeeper(matches, minMatches = 1) {
  const gks = {};
  for (const m of finishedWithResult(matches)) {
    const pr = m.details && m.details.powerRanking;
    const list = (pr && !Array.isArray(pr) && Array.isArray(pr.goalkeepers)) ? pr.goalkeepers : [];
    for (const g of list) {
      if (!g.name) continue;
      const code = g.side === 'home' ? m.homeTeam : g.side === 'away' ? m.awayTeam : null;
      const k = (gks[g.name] = gks[g.name] || { id: g.id || null, name: g.name, code: code || null, matches: 0, defSum: 0 });
      k.matches += 1;
      k.defSum += Number(g.defending) || 0;
      if (!k.code && code) k.code = code;
      if (!k.id && g.id) k.id = g.id;
    }
  }
  const ranked = Object.values(gks)
    .filter((k) => k.matches >= minMatches)
    .map((k) => ({ id: k.id, name: k.name, code: k.code, matches: k.matches, avgDef: k.defSum / k.matches }))
    .sort((a, b) => b.avgDef - a.avgDef || b.matches - a.matches || a.name.localeCompare(b.name, 'da'));
  return ranked[0] || null;
}

/**
 * Turneringens hold (bedste 11'er) fra FIFA-power-indekset. Markspillere
 * aggregeres pr. kamp (gennemsnitlig angrebs-/kreativitets-/forsvarsscore) og
 * fordeles på opstillingen (default 4-3-3): angreb valgt på angrebsscore,
 * midtbane på kreativitet, forsvar på forsvarsscore — grådigt, uden gengangere.
 * Målmand fra bestGoalkeeper. Returnerer null hvis for få spillere.
 */
function computeTeamOfTournament(matches, { minMatches = 3, formation = '4-3-3' } = {}) {
  const parts = String(formation).split('-').map((n) => parseInt(n, 10));
  const nDef = Number.isFinite(parts[0]) ? parts[0] : 4;
  const nMid = Number.isFinite(parts[1]) ? parts[1] : 3;
  const nFwd = Number.isFinite(parts[2]) ? parts[2] : 3;
  const need = nDef + nMid + nFwd;

  const agg = {};
  for (const m of finishedWithResult(matches)) {
    const pr = m.details && m.details.powerRanking;
    const outfield = Array.isArray(pr) ? pr : (pr && pr.outfield) || [];
    for (const p of outfield) {
      if (!p || !p.name) continue;
      const key = p.id != null ? String(p.id) : p.name;
      const code = p.side === 'home' ? m.homeTeam : p.side === 'away' ? m.awayTeam : null;
      const a = (agg[key] = agg[key] || { id: p.id != null ? String(p.id) : null, name: p.name, code: code || null, matches: 0, att: 0, def: 0, cre: 0, total: 0 });
      a.matches += 1;
      a.att += Number(p.att) || 0;
      a.def += Number(p.def) || 0;
      a.cre += Number(p.cre) || 0;
      a.total += Number(p.total) || 0;
      if (!a.code && code) a.code = code;
    }
  }
  const pool = Object.values(agg)
    .filter((p) => p.matches >= minMatches)
    .map((p) => ({
      id: p.id, name: p.name, code: p.code, matches: p.matches,
      avgAtt: Math.round((p.att / p.matches) * 10) / 10,
      avgDef: Math.round((p.def / p.matches) * 10) / 10,
      avgCre: Math.round((p.cre / p.matches) * 10) / 10,
      avgTotal: Math.round((p.total / p.matches) * 10) / 10,
    }));
  if (pool.length < need) return null;

  const used = new Set();
  const uid = (p) => p.id || p.name;
  const pick = (metric, n) => {
    const chosen = pool.filter((p) => !used.has(uid(p)))
      .sort((a, b) => b[metric] - a[metric] || b.avgTotal - a.avgTotal || a.name.localeCompare(b.name, 'da'))
      .slice(0, n);
    for (const p of chosen) used.add(uid(p));
    return chosen;
  };
  const forwards = pick('avgAtt', nFwd);
  const midfielders = pick('avgCre', nMid);
  const defenders = pick('avgDef', nDef);
  const gk = bestGoalkeeper(matches, Math.min(minMatches, 1));
  return { formation, gk, defenders, midfielders, forwards };
}

module.exports = {
  finishedWithResult, kickoffMs,
  computeChampion, computeGoldenBoot, computeFacts,
  bestGoalkeeper, computeTeamOfTournament,
};
