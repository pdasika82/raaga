import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  initialize: vi.fn(), onChange: vi.fn(), google: vi.fn(), email: vi.fn(), create: vi.fn(),
  reset: vi.fn(), signOut: vi.fn(), emulator: vi.fn(), language: vi.fn(), providerParams: vi.fn(),
  auth: { currentUser: null },
}));
vi.mock('firebase/app', () => ({ initializeApp: sdk.initialize }));
vi.mock('firebase/auth', () => ({
  getAuth: () => sdk.auth, onAuthStateChanged: sdk.onChange, signInWithPopup: sdk.google,
  signInWithEmailAndPassword: sdk.email, createUserWithEmailAndPassword: sdk.create,
  sendPasswordResetEmail: sdk.reset, signOut: sdk.signOut, sendEmailVerification: vi.fn(),
  connectAuthEmulator: sdk.emulator, useDeviceLanguage: sdk.language,
  GoogleAuthProvider: class { setCustomParameters = sdk.providerParams; },
}));
import { AuthService } from './service';
import { authErrorMessage, firebaseConfig, resolveFirebaseConfig } from './config';

const env = { VITE_FIREBASE_API_KEY: 'public-test-key', VITE_FIREBASE_AUTH_DOMAIN: 'arts.example', VITE_FIREBASE_PROJECT_ID: 'arts-test', VITE_FIREBASE_APP_ID: 'app-test' };

beforeEach(() => {
  vi.clearAllMocks();
  Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
  vi.stubEnv('VITE_FIREBASE_AUTH_EMULATOR_URL', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('Firebase authentication', () => {
  it('keeps guest access available when configuration is incomplete', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    const auth = new AuthService();
    auth.init();
    expect(auth.state.status).toBe('unavailable');
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(() => auth.google()).toThrow();
  });

  it('restores identity through Firebase and observes account changes and sign-out', () => {
    const auth = new AuthService();
    const listener = vi.fn();
    const unsubscribe = auth.subscribe(listener);
    auth.init(); auth.init();
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    expect(auth.state.status).toBe('loading');
    const onChange = sdk.onChange.mock.calls[0][1];
    onChange({ uid: 'learner-a' });
    expect(auth.state.user?.uid).toBe('learner-a');
    onChange({ uid: 'learner-b' });
    expect(auth.state.user?.uid).toBe('learner-b');
    onChange(null);
    expect(auth.state).toMatchObject({ status: 'ready', user: null });
    unsubscribe();
    const count = listener.mock.calls.length;
    onChange(null);
    expect(listener).toHaveBeenCalledTimes(count);
  });

  it('delegates credentials to Firebase and separates sign-up from sign-in', async () => {
    const auth = new AuthService(); auth.init(); sdk.onChange.mock.calls[0][1](null);
    await auth.email(' learner@example.test ', 'test-password', false);
    expect(sdk.email).toHaveBeenCalledWith(sdk.auth, 'learner@example.test', 'test-password');
    await auth.email('learner@example.test', 'test-password', true);
    expect(sdk.create).toHaveBeenCalledWith(sdk.auth, 'learner@example.test', 'test-password');
    await auth.google();
    expect(sdk.google).toHaveBeenCalledWith(sdk.auth, expect.anything());
    await auth.signOut();
    expect(sdk.signOut).toHaveBeenCalledWith(sdk.auth);
  });

  it('does not connect production builds to an auth emulator', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_FIREBASE_AUTH_EMULATOR_URL', 'http://127.0.0.1:9099');
    new AuthService().init();
    expect(sdk.emulator).not.toHaveBeenCalled();
  });

  it('rejects a remote emulator in development', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_FIREBASE_AUTH_EMULATOR_URL', 'https://not-local.example');
    const auth = new AuthService(); auth.init();
    expect(auth.state.status).toBe('error');
    expect(sdk.emulator).not.toHaveBeenCalled();
  });
});

describe('auth configuration and errors', () => {
  it('uses the registered app by default but rejects partial project overrides', () => {
    const fallback = { projectId: 'default', apiKey: 'key', authDomain: 'default.example', appId: 'default-app' };
    expect(resolveFirebaseConfig({}, fallback)).toEqual(fallback);
    expect(resolveFirebaseConfig({ VITE_FIREBASE_API_KEY: 'another-project' }, fallback)).toBeNull();
    expect(resolveFirebaseConfig(env, fallback)?.projectId).toBe('arts-test');
  });
  it('requires all four web identifiers and trims whitespace', () => {
    expect(firebaseConfig({ ...env, VITE_FIREBASE_APP_ID: ' ' })).toBeNull();
    expect(firebaseConfig({ ...env, VITE_FIREBASE_PROJECT_ID: ' arts-test ' })?.projectId).toBe('arts-test');
  });
  it('explains blocked popups and hides unrecognized provider details', () => {
    expect(authErrorMessage({ code: 'auth/popup-blocked' })).toContain('Allow pop-ups');
    expect(authErrorMessage({ code: 'unknown', message: 'private-provider-detail' })).not.toContain('private-provider-detail');
    expect(authErrorMessage({ code: 'auth/user-not-found' })).toBe(authErrorMessage({ code: 'auth/wrong-password' }));
  });
});
