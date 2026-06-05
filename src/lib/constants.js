// Delte konstanter for datamodel, roller og status.

export const ROLES = {
  OWNER: 'owner', // super-admin (dig): alt, inkl. godkendelse + rolletildeling
  MATCH_ADMIN: 'matchAdmin', // kampe + resultater + bonus-facit (IKKE brugergodkendelse)
  PLAYER: 'player',
};

export const USER_STATUS = {
  PENDING: 'pending', // afventer godkendelse
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// Status for en liga (skal godkendes af admin før den kan bruges)
export const LEAGUE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const MATCH_STATUS = {
  SCHEDULED: 'scheduled', // hold kendt, kan tippes indtil kickoff
  PENDING_TEAMS: 'pendingTeams', // knockout hvor hold endnu ikke kendes
  LIVE: 'live',
  FINISHED: 'finished',
};

export const ROUNDS = {
  GROUP: 'group',
  R32: 'r32', // 1/16-finale
  R16: 'r16', // 1/8-finale
  QF: 'qf', // kvartfinale
  SF: 'sf', // semifinale
  BRONZE: 'bronze',
  FINAL: 'final',
};

export const BONUS_TYPE = {
  TOP_SCORER: 'topScorer',
  GROUP_WINNER: 'groupWinner',
};

// Firestore-collections
export const COL = {
  USERS: 'users',
  MATCHES: 'matches',
  BETS: 'bets',
  BONUS_QUESTIONS: 'bonusQuestions',
  BONUS_BETS: 'bonusBets',
  LEAGUES: 'leagues',
  LEAGUE_COMMENTS: 'leagueComments', // beskeder på en ligas væg
  MESSAGES: 'messages', // private 1:1-beskeder mellem brugere
  TIP_PARTICIPATION: 'tipParticipation', // hvem har tippet pr. kamp (uden at afsløre tips)
  LEAGUE_ACTIVITY: 'leagueActivity', // aktivitets-feed pr. liga
  CONFIG: 'config',
};

export const TIMEZONE = 'Europe/Copenhagen';
