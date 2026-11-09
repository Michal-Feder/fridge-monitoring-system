import './checkNode.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DEFAULT_DB_PATH } from './db/connection.ts';
import { createApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

const db = openDb(DEFAULT_DB_PATH);
const app = createApp(db, clientDist);

app.listen(PORT, () => {
  console.log(`Fridge Watch API on http://localhost:${PORT} (database: ${DEFAULT_DB_PATH})`);
  if (existsSync(clientDist)) console.log(`Serving built client from ${clientDist}`);
});
