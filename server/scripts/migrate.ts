import { migrate, pool } from '../src/db.ts';
try { await migrate(); console.log('Database schema is ready.'); }
finally { await pool.end(); }
