import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { FastifyRequest } from 'fastify';
import { config } from './config.ts';

export interface Identity { uid: string; email: string; name: string }
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export async function authenticate(request: FastifyRequest): Promise<Identity> {
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Sign in to access your practice attempts.');
  try {
    const app = getApps()[0] || initializeApp({ projectId: config.projectId });
    const claims = await getAuth(app).verifyIdToken(token, true);
    if (!claims.email || !claims.email_verified) throw new Error('Verified email required.');
    if (config.demo && !claims.email.endsWith('@example.test')) throw new Error('Demo account required.');
    return { uid: claims.uid, email: claims.email, name: claims.name || claims.email.split('@')[0] };
  } catch { throw new HttpError(401, 'Sign in with a verified email address to submit or view saved attempts.'); }
}
