import { createApi } from './api.ts';
import { config } from './config.ts';
import { pool } from './db.ts';
const app = await createApi();
await app.listen({ port: config.port, host: config.host });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void app.close().then(() => pool.end()));
