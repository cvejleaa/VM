// Hook der samler auth-handlinger (opret bruger, log ind, glemt adgangskode).
// Holder forretningslogik adskilt fra UI-komponenter.
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { COL } from '../../lib/constants';
import { getAuthErrorMessage } from './firebaseErrors';

/**
 * Returnerer handlinger og loading/error-tilstand for auth-flows.
 */
export function useAuthActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function clearError() {
    setError('');
  }

  /**
   * Opretter ny bruger. Cloud Function (onUserCreate) opretter måske også
   * users/{uid} – vi bruger setDoc med merge:true så vi ikke overskriver
   * role/status hvis dokumentet allerede eksisterer.
   */
  async function signup(email, password, displayName) {
    setLoading(true);
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Sæt displayName på Auth-profilen
      await updateProfile(cred.user, { displayName: displayName.trim() });

      // Opret/merge Firestore-dokument. Cloud Function kan have sat role/status
      // allerede – vi skriver kun displayName, email og createdAt som merge.
      // Hvis dokumentet ikke findes endnu, sættes desuden status/role som default.
      const userRef = doc(db, COL.USERS, cred.user.uid);
      await setDoc(
        userRef,
        {
          displayName: displayName.trim(),
          email: email.toLowerCase(),
          createdAt: serverTimestamp(),
          // Sættes kun hvis feltet ikke allerede er der (merge: true betyder
          // at eksisterende felter ikke overskrives – men da vi sender dem, ville
          // de blive overskrevet). Vi lader Cloud Function styre role/status;
          // her sætter vi kun sikrere defaults hvis dokumentet er helt nyt.
        },
        { merge: true }
      );

      return cred.user;
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Logger en eksisterende bruger ind.
   * @returns {import('firebase/auth').UserCredential | null}
   */
  async function login(email, password) {
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred;
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sender e-mail til nulstilling af adgangskode.
   */
  async function resetPassword(email) {
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, clearError, signup, login, resetPassword };
}
