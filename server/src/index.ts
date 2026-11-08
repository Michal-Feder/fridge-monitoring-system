import './checkNode.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const PORT = Number(process.env.PORT ?? 3001);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, node: process.versions.node });
});

// Unknown API paths are 404 JSON, never the SPA page.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// `npm start`: serve the built client from the same port (D19).
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Fridge Watch API on http://localhost:${PORT}`);
  if (existsSync(clientDist)) console.log(`Serving built client from ${clientDist}`);
});
