import { resolve } from 'node:path';

const env = process.env;
const demo = env.DEMO_MODE === 'true';
const feedbackMode = env.FEEDBACK_MODE || 'live';
const fault = env.DEMO_NOTIFICATION_FAULT || 'none';
if (!['live', 'rules'].includes(feedbackMode)) throw new Error('FEEDBACK_MODE must be live or rules.');
if (!['none', 'skip-parent'].includes(fault)) throw new Error('Unknown demo notification fault.');
if (!demo && (env.FIREBASE_AUTH_EMULATOR_HOST || fault !== 'none' || feedbackMode === 'rules')) {
  throw new Error('Auth emulator, rules-only feedback, and injected faults require DEMO_MODE=true.');
}
if (demo && (env.FIREBASE_PROJECT_ID || 'demo-raaga') !== 'demo-raaga') throw new Error('Demo mode must use the isolated demo-raaga Firebase project.');

export const config = {
  demo, feedbackMode: feedbackMode as 'live' | 'rules', fault: fault as 'none' | 'skip-parent',
  databaseUrl: env.DATABASE_URL || 'postgres://raaga:raaga-local-only@127.0.0.1:55432/raaga',
  redisUrl: env.REDIS_URL || 'redis://127.0.0.1:56379',
  projectId: env.FIREBASE_PROJECT_ID || 'certain-ellipse-316421',
  uploadDir: resolve(env.UPLOAD_DIR || './data/uploads'),
  port: Number(env.PORT || 8787), host: env.HOST || '127.0.0.1',
  corsOrigins: (env.CORS_ORIGINS || 'http://127.0.0.1:5175,http://localhost:5175').split(','),
  anthropicKey: env.ANTHROPIC_API_KEY || '', model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  deepgramKey: env.DEEPGRAM_API_KEY || '',
  smtpHost: env.SMTP_HOST || '127.0.0.1', smtpPort: Number(env.SMTP_PORT || 51025),
  mailFrom: env.MAIL_FROM || 'Raaga <practice@raaga.example.test>',
  mailpitUrl: env.MAILPIT_URL || 'http://127.0.0.1:58025',
};
// Demo delivery is confined to a local Mailpit service, never a public SMTP host.
if (demo && !['127.0.0.1', 'localhost', 'mailpit'].includes(config.smtpHost)) throw new Error('Demo SMTP must be Mailpit on localhost or the compose network.');

export function redisConnection() {
  const url = new URL(config.redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0), ...(url.protocol === 'rediss:' ? { tls: {} } : {}) };
}
