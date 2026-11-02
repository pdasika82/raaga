import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../src/config.ts';
import { pool, transaction } from '../src/db.ts';

if (!config.demo || !process.env.FIREBASE_AUTH_EMULATOR_HOST || config.projectId !== 'demo-raaga') throw new Error('Seeding is restricted to the demo auth emulator.');
const auth = getAuth(initializeApp({ projectId: config.projectId }));
// Independent expected roster is also recorded in demo/acceptance.json.
const people = [
  { id: 'demo-maya', name: 'Maya Rao', email: 'maya@example.test', role: 'student' },
  { id: 'demo-arun', name: 'Arun Rao', email: 'arun@example.test', role: 'parent' },
  { id: 'demo-noor', name: 'Noor Shah', email: 'noor@example.test', role: 'student' },
  { id: 'demo-leela', name: 'Leela Shah', email: 'leela@example.test', role: 'parent' },
  { id: 'demo-asha', name: 'Asha Rao', email: 'asha@example.test', role: 'parent' },
];
try {
  for (const person of people) {
    const user = { displayName: person.name, email: person.email, emailVerified: true, password: 'Raaga-demo-2026!' };
    try { await auth.createUser({ uid: person.id, ...user }); }
    catch (error) {
      if ((error as { code?: string }).code !== 'auth/uid-already-exists' && (error as { code?: string }).code !== 'auth/email-already-exists') throw error;
      await auth.updateUser(person.id, user);
    }
  }
  await transaction(async tx => {
    for (const person of people) await tx.query('INSERT INTO people(id,name,email,role) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,role=EXCLUDED.role', [person.id, person.name, person.email, person.role]);
    for (const [student, parent, optedIn] of [['demo-maya', 'demo-arun', true], ['demo-maya', 'demo-asha', false], ['demo-noor', 'demo-leela', true]]) {
      await tx.query('INSERT INTO student_parents(student_id,parent_id,opted_in) VALUES($1,$2,$3) ON CONFLICT(student_id,parent_id) DO UPDATE SET opted_in=EXCLUDED.opted_in', [student, parent, optedIn]);
    }
  });
  console.log('Seeded synthetic demo accounts: Maya + opted-in Arun; opted-out Asha; unrelated Noor + Leela.');
} finally { await pool.end(); }
