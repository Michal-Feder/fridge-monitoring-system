// The Express app, built around an open DB so it can run against any database file.
import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { Db } from './db/connection.ts';
import { apiRouter } from './routes/api.ts';
import { HttpError } from './services/errors.ts';

export function createApp(db: Db, clientDist?: string) {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use('/api', apiRouter(db));

  // Unknown API paths are 404 JSON, never the SPA page.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // `npm start`: serve the built client from the same port (D19).
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'The request body is not valid JSON.' });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'The files are too large to upload at once (25 MB). Upload fewer files.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Details are in the server log.' });
  };
  app.use(onError);
  return app;
}
