import type { AuthState } from './service';

export function protectedPage(route: string): string | null {
  if (route === 'sessions' || route === 'session') return 'recorded sessions';
  if (route === 'settings') return 'advanced settings';
  if (route === 'grade-raaga' || route === 'grade-kuchipudi') return 'AI recording reviews';
  return null;
}

export function isSignedIn(state: AuthState): boolean {
  return state.status === 'ready' && !!state.user && !state.user.isAnonymous;
}
