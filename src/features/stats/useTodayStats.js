// ---------------------------------------------------------------------------
// Hook: useTodayStats – henter dagens afgjorte kampe, alle tips på dem, og
// spillernavne. Bruges af Statistik-siden. Tips kan først læses efter kickoff
// (Security Rules), hvilket dagens afgjorte kampe altid opfylder.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, MATCH_STATUS, TIMEZONE } from '../../lib/constants';
import { getTodayInCPH, computeDailyPoints } from '../leaderboard/standingsUtils';

export function useTodayStats() {
  const todayStr = useMemo(() => getTodayInCPH(), []);
  const [matches, setMatches] = useState([]);
  const [bets, setBets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingBets, setLoadingBets] = useState(true);
  const [error, setError] = useState(null);

  // Afsluttede kampe
  useEffect(() => {
    const q = query(collection(db, COL.MATCHES), where('status', '==', MATCH_STATUS.FINISHED));
    return onSnapshot(q,
      (snap) => { setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoadingMatches(false); },
      (err) => { console.error('useTodayStats matches:', err); setError('Kunne ikke hente kampe.'); setLoadingMatches(false); },
    );
  }, []);

  // Spillere (til navne)
  useEffect(() => {
    return onSnapshot(collection(db, COL.USERS),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('useTodayStats users:', err),
    );
  }, []);

  // Dagens afsluttede kampe
  const todayMatches = useMemo(() => {
    return matches
      .filter((m) => {
        const k = m.kickoff?.toDate ? m.kickoff.toDate() : new Date(m.kickoff);
        return k.toLocaleDateString('sv-SE', { timeZone: TIMEZONE }) === todayStr;
      })
      .sort((a, b) => {
        const ka = a.kickoff?.toDate ? a.kickoff.toDate() : new Date(a.kickoff);
        const kb = b.kickoff?.toDate ? b.kickoff.toDate() : new Date(b.kickoff);
        return ka - kb;
      });
  }, [matches, todayStr]);

  const todayMatchIds = useMemo(() => todayMatches.map((m) => m.id), [todayMatches]);

  // Tips for dagens kampe (chunket pga. Firestore 'in'-grænse)
  useEffect(() => {
    if (loadingMatches) return undefined;
    if (todayMatchIds.length === 0) { setBets([]); setLoadingBets(false); return undefined; }

    const chunks = [];
    for (let i = 0; i < todayMatchIds.length; i += 30) chunks.push(todayMatchIds.slice(i, i + 30));
    let all = [];
    let pending = chunks.length;
    const unsubs = chunks.map((chunk) =>
      onSnapshot(query(collection(db, COL.BETS), where('matchId', 'in', chunk)),
        (snap) => {
          const cb = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          all = [...all.filter((b) => !chunk.includes(b.matchId)), ...cb];
          setBets([...all]);
          pending -= 1; if (pending <= 0) setLoadingBets(false);
        },
        (err) => { console.error('useTodayStats bets:', err); setError('Kunne ikke hente tips.'); setLoadingBets(false); },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [todayMatchIds, loadingMatches]);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const betsByMatch = useMemo(() => {
    const map = new Map();
    for (const b of bets) {
      if (!map.has(b.matchId)) map.set(b.matchId, []);
      map.get(b.matchId).push(b);
    }
    return map;
  }, [bets]);

  const pointsByUid = useMemo(
    () => computeDailyPoints(matches, bets, todayStr),
    [matches, bets, todayStr],
  );

  return {
    todayStr,
    todayMatches,
    betsByMatch,
    usersById,
    pointsByUid,
    loading: loadingMatches || loadingBets,
    error,
  };
}
