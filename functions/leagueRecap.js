'use strict';
// ---------------------------------------------------------------------------
// leagueRecap.js — ren logik til AI-genererede morgenopslag på liga-væggen.
// Selve AI-kaldet (Anthropic) og Firestore-adgangen ligger i index.js; her er
// kun det testbare: liga-scoring, fakta-opbygning og system-prompten.
// ---------------------------------------------------------------------------

const RECAP_SYSTEM = `Du er "VM-Botten", som skriver ét kort, varmt morgenopslag på dansk til en privat VM 2026-tippeliga.
Skriv 70-150 ord i naturlig, sammenhængende prosa (ikke punktopstilling, ingen overskrift, ingen anførselstegn).
Nævn døgnets udvikling og lykønsk den spiller, der gjorde det bedst i nat.
Du må KUN bruge de oplyste fakta. Find ALDRIG på navne, kampe, resultater, point eller placeringer, og påstå ikke placeringsskift medmindre det tydeligt fremgår af tallene.
Hold er angivet som FIFA-landekoder (fx BRA=Brasilien, ARG=Argentina, DEN=Danmark) — brug de danske landenavne.
Hvis "matches" er tom (ingen kampe i nat), så skriv en kort, opmuntrende god-morgen-hilsen og mind venligt om at få tippet dagens kampe.
Slut gerne med en lille optakt til dagens kampe, hvis "upcoming" har nogle. Brug 1-2 emojis.`;

/**
 * Minimal liga-scoring (spejler leagueScore i frontend; uden liga-bonus, som
 * beregnes klient-side). Bruges kun til at finde lederen i recap'en.
 */
function leagueTotal(user, scoring) {
  const s = scoring || {};
  const on = (k) => s[k] !== false; // mangler feltet ⇒ tæller (default til)
  let t = 0;
  if (on('group')) t += Number(user?.groupPoints || 0);
  if (on('knockout')) t += Number(user?.knockoutPoints || 0) * (s.doubleKnockout ? 2 : 1);
  if (on('bonus')) t += Number(user?.bonusPoints || 0);
  return t;
}

/** Saml fakta-objektet (kun tal/navne) som Claude skriver prosa ud fra. */
function buildRecapFacts({ league, members, dayPointsByUid = {}, matches = [], upcoming = [], now = new Date() }) {
  const date = now.toLocaleDateString('da-DK', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Copenhagen',
  });
  const scoring = league && league.scoring ? league.scoring : null;

  const standings = members
    .map((u) => ({ name: u.displayName || 'Spiller', points: leagueTotal(u, scoring) }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 6)
    .map((r, i) => ({ rank: i + 1, name: r.name, points: r.points }));

  const dayPoints = members
    .map((u) => ({ name: u.displayName || 'Spiller', points: Number(dayPointsByUid[u.id] || 0) }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points);

  return {
    leagueName: (league && league.name) || 'ligaen',
    date,
    matches,
    standings,
    dayPoints,
    standout: dayPoints.length > 0 ? dayPoints[0] : null,
    upcoming,
    memberCount: members.length,
  };
}

module.exports = { RECAP_SYSTEM, leagueTotal, buildRecapFacts };
