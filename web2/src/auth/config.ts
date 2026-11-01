import type { FirebaseOptions } from 'firebase/app';

export function firebaseConfig(env: Record<string, unknown>): FirebaseOptions | null {
  const value = (key: string) => typeof env[key] === 'string' ? (env[key] as string).trim() : '';
  const apiKey = value('VITE_FIREBASE_API_KEY');
  const authDomain = value('VITE_FIREBASE_AUTH_DOMAIN');
  const projectId = value('VITE_FIREBASE_PROJECT_ID');
  const appId = value('VITE_FIREBASE_APP_ID');
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

/** A partial environment override is an error, never a mixture of two projects. */
export function resolveFirebaseConfig(env: Record<string, unknown>, fallback: FirebaseOptions): FirebaseOptions | null {
  const hasOverride = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'].some(key => {
    const value = env[`VITE_FIREBASE_${key}`];
    return typeof value === 'string' && value.trim().length > 0;
  });
  return hasOverride ? firebaseConfig(env) : fallback;
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'The email or password is incorrect. Try again or reset your password.',
    'auth/wrong-password': 'The email or password is incorrect. Try again or reset your password.',
    'auth/user-not-found': 'The email or password is incorrect. Try again or reset your password.',
    'auth/email-already-in-use': 'This email already has an account. Sign in or reset your password.',
    'auth/weak-password': 'Choose a stronger password that meets the account password policy.',
    'auth/password-does-not-meet-requirements': 'Choose a stronger password that meets the account password policy.',
    'auth/popup-closed-by-user': 'Sign-in was closed. You can try again or continue as a guest.',
    'auth/cancelled-popup-request': 'Another sign-in window is already open.',
    'auth/popup-blocked': 'Allow pop-ups for this site, or sign in with email and password.',
    'auth/unauthorized-domain': 'Sign-in is not enabled for this website yet. You can continue as a guest.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled yet. Try another method or continue as a guest.',
    'auth/network-request-failed': 'Could not connect. Check your internet connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little before trying again.',
    'auth/user-disabled': 'This account has been disabled. Contact the app administrator.',
    'auth/account-exists-with-different-credential': 'Use the sign-in method you originally used for this email.',
  };
  return messages[code] ?? 'Sign-in could not be completed. Please try again or continue as a guest.';
}
