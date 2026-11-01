// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../auth/service';

const mocks = vi.hoisted(() => ({
  state: { status: 'ready', user: null, message: '' } as AuthState,
  listener: null as ((state: AuthState) => void) | null,
  all: vi.fn(), get: vi.fn(), recording: vi.fn(),
}));
vi.mock('../auth/service', () => ({ auth: {
  get state() { return mocks.state; },
  subscribe: (listener: (state: AuthState) => void) => { mocks.listener = listener; listener(mocks.state); }, init: vi.fn(),
} }));
vi.mock('@storage/db', () => ({ requestPersistence: vi.fn(), ExampleStore: { get: vi.fn().mockResolvedValue(null) }, SessionStore: { all: mocks.all, get: mocks.get, recording: mocks.recording } }));
vi.mock('./onboarding', () => ({ hasSeenOnboarding: () => true, showOnboarding: vi.fn(), markOnboardingSeen: vi.fn() }));
import { App } from './app';

let app: App;
let root: HTMLElement;
const listeners: EventListener[] = [];
const user = { uid: 'test-learner', isAnonymous: false } as AuthState['user'];
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const emit = (state: AuthState) => { mocks.state = state; mocks.listener?.(state); };
async function mount(hash: string, state: AuthState = { status: 'ready', user: null, message: '' }) {
  mocks.state = state; history.replaceState(null, '', `/${hash}`);
  root = document.createElement('div'); document.body.append(root);
  app = new App(root); await app.init(); await tick();
}
beforeEach(() => {
  mocks.all.mockReset().mockResolvedValue([]); mocks.get.mockReset(); mocks.recording.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => { if (type === 'hashchange') listeners.push(listener as EventListener); add(type, listener, options); });
});
afterEach(async () => {
  app?.navigate('arts'); await tick();
  listeners.splice(0).forEach(listener => window.removeEventListener('hashchange', listener));
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('protected routes', () => {
  it.each(['#/sessions', '#/session/private-take', '#/settings', '#/grade-raaga/first_notes', '#/grade-kuchipudi/alignment'])('blocks direct guest access to %s before loading data', async hash => {
    await mount(hash);
    expect(root.textContent).toContain('Sign in to continue');
    expect(mocks.all).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.recording).not.toHaveBeenCalled();
    expect(root.querySelector('input[type=password]')).toBeNull();
  });

  it('waits for restored identity, opens the page, and relocks immediately on sign-out', async () => {
    await mount('#/settings', { status: 'loading', user: null, message: '' });
    expect(root.textContent).toContain('Checking your sign-in');
    expect(root.textContent).not.toContain('Anthropic API key');
    emit({ status: 'ready', user, message: '' }); await tick();
    expect(root.textContent).toContain('Anthropic API key');
    emit({ status: 'ready', user: null, message: '' });
    expect(root.textContent).not.toContain('Anthropic API key');
    expect(root.textContent).toContain('Sign in to continue');
  });

  it.each(['#/session/private-take', '#/grade-kuchipudi/alignment'])('returns to the requested destination %s after sign-in', async hash => {
    await mount(hash);
    [...root.querySelectorAll('button')].find(button => button.textContent === 'Sign in to continue')!.click(); await tick();
    expect(location.hash).toBe('#/account'); expect(root.textContent).toContain('We’ll take you back');
    emit({ status: 'ready', user, message: '' }); await tick();
    expect(location.hash).toBe(hash);
    if (hash.startsWith('#/session')) expect(mocks.get).toHaveBeenCalledWith('private-take');
    else expect(root.querySelector<HTMLSelectElement>('[aria-label="Lesson to grade"]')!.value).toBe('alignment');
  });

  it('does not resurrect a session or its audio after sign-out during loading', async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockReturnValue(new Promise(done => { resolve = done; }));
    await mount('#/session/private-take', { status: 'ready', user, message: '' });
    emit({ status: 'ready', user: null, message: '' });
    resolve({ id: 'private-take', lessonTitle: 'Private lesson' }); await tick();
    expect(root.textContent).not.toContain('Private lesson');
    expect(mocks.recording).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Sign in to continue');
  });

  it('does not return to a protected page after choosing to continue as a guest', async () => {
    await mount('#/settings');
    [...root.querySelectorAll('button')].find(button => button.textContent === 'Sign in to continue')!.click(); await tick();
    app.navigate('arts'); await tick();
    emit({ status: 'ready', user, message: '' }); await tick();
    expect(location.hash).toBe(''); expect(root.textContent).toContain('Find your rhythm.');
  });

  it('stops playback and releases the recording URL when signing out', async () => {
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:private-take'), revokeObjectURL: vi.fn() }));
    mocks.get.mockResolvedValue({ id: 'private-take', date: '2026-11-01T12:00:00Z', lessonTitle: 'Private lesson', scaleId: 'shankarabharanam', tonic: 0, a4: 440, duration: 2, samples: [] });
    mocks.recording.mockResolvedValue(new Blob(['audio']));
    await mount('#/session/private-take', { status: 'ready', user, message: '' });
    const audio = root.querySelector('audio')!;
    expect(audio.src).toBe('blob:private-take');
    const pause = vi.spyOn(audio, 'pause');
    emit({ status: 'ready', user: null, message: '' });
    expect(pause).toHaveBeenCalled(); expect(audio.hasAttribute('src')).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-take');
    expect(root.querySelector('audio')).toBeNull();
  });
});
