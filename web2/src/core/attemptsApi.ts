import { auth } from '../auth/service';
import type { Exercise, SavedAttempt } from '../../../shared/attempts';

const base = (import.meta.env.VITE_GRADING_API_URL || '').replace(/\/$/, '');
export const savedGradingEnabled = !!base;

async function request<T>(path: string, signal: AbortSignal, options: RequestInit = {}): Promise<T> {
  const user = auth.state.user;
  if (!user) throw new Error('Sign in to access your saved practice.');
  const token = await user.getIdToken();
  signal.throwIfAborted();
  let response: Response;
  try { response = await fetch(`${base}/api${path}`, { ...options, signal, headers: { ...options.headers, Authorization: `Bearer ${token}` } }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Could not reach the practice server. Check your connection and try again.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The practice server could not complete this request.');
  // A sign-out or account change must never render the previous student's response.
  if (auth.state.user?.uid !== user.uid) throw new DOMException('Account changed', 'AbortError');
  return data as T;
}
export const getExercises = (signal: AbortSignal) => request<{ exercises: Exercise[]; feedbackMode: 'live' | 'rules'; demo: boolean }>('/exercises', signal);
export const getAttempts = (signal: AbortSignal) => request<{ attempts: SavedAttempt[] }>('/attempts', signal);
export const getAttempt = (id: string, signal: AbortSignal) => request<{ attempt: SavedAttempt }>(`/attempts/${encodeURIComponent(id)}`, signal);
export function submitAttempt(file: File, exerciseId: string, teacherNote: string, runId: string, key: string, signal: AbortSignal) {
  const body = new FormData();
  body.set('exerciseId', exerciseId); body.set('teacherNote', teacherNote); body.set('runId', runId); body.set('recording', file);
  return request<{ attempt: SavedAttempt }>('/attempts', signal, { method: 'POST', body, headers: { 'Idempotency-Key': key } });
}
