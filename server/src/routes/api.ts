// Thin HTTP handlers: parse the request, call a service, send JSON (CLAUDE.md). No rules here.
import { Router } from 'express';
import type { Db } from '../db/connection.ts';
import { previewImport, confirmImport, type UploadFile, type Decisions } from '../services/importService.ts';
import { dashboard, fridgeDetail, fridgeReport, search } from '../services/analysisService.ts';
import { listBranches, createBranch, createFridge, updateFridge, listLoggers, setLoggerUnit, moveLogger } from '../services/setupService.ts';
import { badRequest } from '../services/errors.ts';
import { range, windowParam, numberParam, idParam, nowLocal } from './params.ts';

function uploadBody(body: unknown): { files: UploadFile[]; decisions: Decisions } {
  const b = (body ?? {}) as { files?: unknown; decisions?: unknown };
  if (!Array.isArray(b.files) || b.files.length === 0) throw badRequest('Send {"files": [{"name": "...", "text": "..."}]}.');
  const files = b.files.map((f, i) => {
    const x = f as { name?: unknown; text?: unknown };
    if (typeof x?.name !== 'string' || typeof x?.text !== 'string') throw badRequest(`File ${i + 1} needs a "name" and a "text".`);
    return { name: x.name, text: x.text };
  });
  if (new Set(files.map((f) => f.name)).size !== files.length) throw badRequest('Two files have the same name; rename one.');
  const decisions = b.decisions && typeof b.decisions === 'object' ? (b.decisions as Decisions) : {};
  return { files, decisions };
}

export function apiRouter(db: Db): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, node: process.versions.node });
  });

  // upload, then confirm (D16): preview writes nothing; confirm needs every unit decision (D3)
  r.post('/imports/preview', (req, res) => {
    const { files, decisions } = uploadBody(req.body);
    res.json(previewImport(db, files, decisions));
  });
  r.post('/imports/confirm', (req, res) => {
    const { files, decisions } = uploadBody(req.body);
    const result = confirmImport(db, files, decisions, nowLocal());
    res.status(result.ok ? 200 : 422).json(result);
  });

  r.get('/dashboard', (req, res) => {
    res.json(dashboard(db, windowParam(req.query.window)));
  });

  r.get('/fridges/:id', (req, res) => {
    res.json(fridgeDetail(db, idParam(req.params.id), range(req.query)));
  });
  r.get('/fridges/:id/report', (req, res) => {
    res.json(fridgeReport(db, idParam(req.params.id), range(req.query)));
  });
  r.patch('/fridges/:id', (req, res) => {
    res.json(updateFridge(db, idParam(req.params.id), req.body ?? {}));
  });
  r.post('/fridges', (req, res) => {
    res.status(201).json(createFridge(db, req.body ?? {}));
  });

  r.get('/search', (req, res) => {
    const q = req.query;
    const certainty = q.certainty === 'certainly' ? 'certainly' : 'possibly';
    if (q.certainty !== undefined && q.certainty !== 'possibly' && q.certainty !== 'certainly') throw badRequest('"certainty" must be possibly or certainly.');
    const minMinutes = numberParam(q.minMinutes, 'minMinutes', 30);
    if (minMinutes < 0) throw badRequest('"minMinutes" cannot be negative.');
    res.json(search(db, { above: numberParam(q.above, 'above', 5.0), minMinutes, certainty, ...range(q) }));
  });

  r.get('/branches', (_req, res) => {
    res.json(listBranches(db));
  });
  r.post('/branches', (req, res) => {
    const b = createBranch(db, req.body?.name);
    res.status(b.created ? 201 : 200).json(b);
  });

  r.get('/loggers', (_req, res) => {
    res.json(listLoggers(db));
  });
  r.patch('/loggers/:id', (req, res) => {
    res.json(setLoggerUnit(db, req.params.id, req.body?.unit));
  });
  r.post('/loggers/:id/move', (req, res) => {
    res.json(moveLogger(db, req.params.id, req.body ?? {}));
  });

  return r;
}
