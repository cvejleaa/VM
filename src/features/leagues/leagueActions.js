/**
 * Firebase-handlinger for ligaer: opret, tilmeld, forlad, slet, fjern medlem.
 */
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { generateJoinCode } from './leagueUtils';

/**
 * Opret en ny liga.
 * @param {string} name      – ligaens navn
 * @param {string} ownerUid  – opretterens uid
 * @returns {Promise<string>} – det nye dokument-id
 */
export async function createLeague(name, ownerUid) {
  if (!name?.trim()) throw new Error('Ligaen skal have et navn.');
  if (!ownerUid) throw new Error('Mangler brugerId.');

  const joinCode = generateJoinCode();

  const ref = await addDoc(collection(db, COL.LEAGUES), {
    name: name.trim(),
    ownerUid,
    joinCode,
    memberUids: [ownerUid],
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Tilmeld den aktuelle bruger til en liga via join-kode.
 * @param {string} joinCode
 * @param {string} uid
 * @returns {Promise<{id: string, name: string}>} – liga-info
 */
export async function joinLeague(joinCode, uid) {
  if (!joinCode?.trim()) throw new Error('Angiv en gyldig kode.');
  if (!uid) throw new Error('Mangler brugerId.');

  // Find liga med den angivne kode
  const q = query(
    collection(db, COL.LEAGUES),
    where('joinCode', '==', joinCode.trim().toUpperCase()),
  );
  const snap = await getDocs(q);

  if (snap.empty) throw new Error('Ingen liga fundet med den kode.');

  const leagueDoc = snap.docs[0];
  const leagueData = leagueDoc.data();

  // Tjek om brugeren allerede er medlem
  if (leagueData.memberUids?.includes(uid)) {
    throw new Error('Du er allerede medlem af denne liga.');
  }

  await updateDoc(leagueDoc.ref, {
    memberUids: arrayUnion(uid),
  });

  return { id: leagueDoc.id, name: leagueData.name };
}

/**
 * Forlad en liga (fjerner eget uid fra memberUids).
 * Ejeren kan ikke forlade sin egen liga; han/hun skal slette den.
 * @param {string} leagueId
 * @param {string} uid
 * @param {string} ownerUid
 */
export async function leaveLeague(leagueId, uid, ownerUid) {
  if (uid === ownerUid) throw new Error('Ejeren kan ikke forlade sin liga. Slet den i stedet.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), {
    memberUids: arrayRemove(uid),
  });
}

/**
 * Slet en liga (kun ejeren).
 * @param {string} leagueId
 * @param {string} uid
 * @param {string} ownerUid
 */
export async function deleteLeague(leagueId, uid, ownerUid) {
  if (uid !== ownerUid) throw new Error('Kun ejeren kan slette ligaen.');
  await deleteDoc(doc(db, COL.LEAGUES, leagueId));
}

/**
 * Fjern et bestemt medlem fra en liga (kun ejeren).
 * @param {string} leagueId
 * @param {string} memberUid  – uid'et der skal fjernes
 * @param {string} ownerUid   – der laver handlingen
 */
export async function removeMember(leagueId, memberUid, ownerUid) {
  if (memberUid === ownerUid) throw new Error('Du kan ikke fjerne dig selv som ejer.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), {
    memberUids: arrayRemove(memberUid),
  });
}
