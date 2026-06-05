/**
 * Firebase-handlinger for individuelle liga-bonusspørgsmål.
 */
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, LEAGUE_BONUS_TYPE } from '../../lib/constants';

const VALID = Object.values(LEAGUE_BONUS_TYPE);

/**
 * Opret et bonusspørgsmål i en liga (kun manager – håndhæves af reglerne).
 * @param {object} p
 */
export async function createLeagueBonus({ leagueId, createdBy, type, label, options = [], size = 5, deadline }) {
  if (!leagueId) throw new Error('Mangler liga.');
  if (!createdBy) throw new Error('Du skal være logget ind.');
  if (!VALID.includes(type)) throw new Error('Ukendt spørgsmålstype.');
  if (!label?.trim()) throw new Error('Skriv et spørgsmål.');
  if (!deadline) throw new Error('Vælg en svarfrist.');
  if (type === LEAGUE_BONUS_TYPE.CHOICE && options.filter((o) => o.trim()).length < 2) {
    throw new Error('Angiv mindst to svarmuligheder.');
  }

  const data = {
    leagueId,
    createdBy,
    type,
    label: label.trim(),
    deadline,
    facit: null,
    createdAt: serverTimestamp(),
  };
  if (type === LEAGUE_BONUS_TYPE.CHOICE) data.options = options.map((o) => o.trim()).filter(Boolean);
  if (type === LEAGUE_BONUS_TYPE.TOPLIST) data.size = Math.min(Math.max(Number(size) || 5, 1), 10);

  const ref = await addDoc(collection(db, COL.LEAGUE_BONUS), data);
  return ref.id;
}

/** Sæt facit på et spørgsmål (manager). */
export async function setLeagueBonusFacit(questionId, facit) {
  await updateDoc(doc(db, COL.LEAGUE_BONUS, questionId), { facit });
}

/** Slet et spørgsmål (manager). */
export async function deleteLeagueBonus(questionId) {
  await deleteDoc(doc(db, COL.LEAGUE_BONUS, questionId));
}

/**
 * Gem brugerens svar (id = qid_uid), før deadline.
 * @param {object} p
 */
export async function saveLeagueBonusAnswer({ questionId, leagueId, uid, answer }) {
  if (!questionId || !uid) throw new Error('Mangler data.');
  await setDoc(doc(db, COL.LEAGUE_BONUS_ANSWERS, `${questionId}_${uid}`), {
    questionId,
    leagueId,
    uid,
    answer,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
