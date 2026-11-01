import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, GoogleAuthProvider,
  onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut, useDeviceLanguage, type Auth, type User,
} from 'firebase/auth';
import { authErrorMessage, resolveFirebaseConfig } from './config';
import publicConfig from './firebase.public.json';

export interface AuthState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  user: User | null;
  message: string;
}

/** Firebase owns session persistence and tokens. No credentials are stored by the UI. */
export class AuthService {
  state: AuthState = { status: 'loading', user: null, message: '' };
  private auth: Auth | null = null;
  private listeners = new Set<(state: AuthState) => void>();
  private started = false;

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(state: AuthState): void {
    this.state = state;
    this.listeners.forEach(listener => listener(state));
  }

  init(): void {
    if (this.started) return;
    this.started = true;
    const config = resolveFirebaseConfig(import.meta.env, publicConfig);
    if (!config) {
      this.emit({ status: 'unavailable', user: null, message: 'Account sign-in is not available on this version yet. You can explore both arts as a guest.' });
      return;
    }
    try {
      this.auth = getAuth(initializeApp(config, 'lms-for-arts'));
      // Explicit local-development opt-in only; production always uses real Firebase.
      if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
        const url = new URL(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('The auth emulator must be local.');
        connectAuthEmulator(this.auth, url.origin);
      }
      useDeviceLanguage(this.auth);
      onAuthStateChanged(this.auth,
        user => this.emit({ status: 'ready', user, message: '' }),
        error => this.emit({ status: 'error', user: null, message: authErrorMessage(error) }));
    } catch (error) {
      this.emit({ status: 'error', user: null, message: authErrorMessage(error) });
    }
  }

  private ready(): Auth {
    if (!this.auth || this.state.status !== 'ready') throw new Error('Authentication is unavailable.');
    return this.auth;
  }

  google(): Promise<unknown> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    // Popup is intentional: the app is hosted on GitHub Pages, outside authDomain.
    return signInWithPopup(this.ready(), provider);
  }

  email(email: string, password: string, create: boolean): Promise<unknown> {
    return create
      ? createUserWithEmailAndPassword(this.ready(), email.trim(), password)
      : signInWithEmailAndPassword(this.ready(), email.trim(), password);
  }

  resetPassword(email: string): Promise<void> { return sendPasswordResetEmail(this.ready(), email.trim()); }
  signOut(): Promise<void> { return signOut(this.ready()); }
  verifyEmail(): Promise<void> {
    const user = this.ready().currentUser;
    if (!user) throw new Error('Sign in first.');
    return sendEmailVerification(user);
  }
}

export const auth = new AuthService();
