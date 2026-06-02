// ---------------------------------------------------------------------------
// useBonusData – henter bonusspørgsmål og brugerens bonus-svar med onSnapshot.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Henter alle bonusspørgsmål sorteret efter deadline.
 * @returns {{ questions: Array, loading: boolean, error: string|null }}
 */
export function useBonusQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, COL.BONUS_QUESTIONS),
      orderBy('deadline', 'asc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('useBonusQuestions fejl:', err);
        setError('Kunne ikke hente bonusspørgsmål.');
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  return { questions, loading, error };
}

/**
 * Henter brugerens egne bonus-svar.
 * Returnerer en Map: questionId → bonusBet-objekt.
 * @param {string|null} uid
 * @returns {{ bonusBets: Map, loading: boolean, error: string|null }}
 */
export function useMyBonusBets(uid) {
  const [bonusBets, setBonusBets] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setBonusBets(new Map());
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COL.BONUS_BETS),
      where('uid', '==', uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const m = new Map();
        snap.docs.forEach((d) => {
          const data = d.data();
          m.set(data.questionId, { id: d.id, ...data });
        });
        setBonusBets(m);
        setLoading(false);
      },
      (err) => {
        console.error('useMyBonusBets fejl:', err);
        setError('Kunne ikke hente dine bonus-svar.');
        setLoading(false);
      },
    );

    return unsub;
  }, [uid]);

  return { bonusBets, loading, error };
}
