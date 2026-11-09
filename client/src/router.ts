// Hash routes (#/, #/upload, #/fridge/5, #/fridge/5/report?from=..&to=..): no router dependency (D17, D37).
// Hash URLs also work from `npm start` without any server-side fallback route.
import { useEffect, useState } from 'react';
import type { Range } from './api.ts';

export type Route =
  | { page: 'dashboard' }
  | { page: 'upload' }
  | { page: 'fridge'; id: number; range: Partial<Range> }
  | { page: 'report'; id: number; range: Partial<Range> }
  | { page: 'search'; query: URLSearchParams }
  | { page: 'setup' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = (hash.replace(/^#/, '') || '/').split('?');
  const q = new URLSearchParams(query);
  const range: Partial<Range> = {};
  if (q.get('from')) range.from = q.get('from')!;
  if (q.get('to')) range.to = q.get('to')!;
  if (path === '/upload') return { page: 'upload' };
  if (path === '/search') return { page: 'search', query: q };
  if (path === '/setup') return { page: 'setup' };
  const m = /^\/fridge\/(\d+)(\/report)?$/.exec(path);
  if (m) return { page: m[2] ? 'report' : 'fridge', id: Number(m[1]), range };
  return { page: 'dashboard' };
}

const withRange = (path: string, r?: Partial<Range>) => {
  const q = new URLSearchParams();
  if (r?.from) q.set('from', r.from);
  if (r?.to) q.set('to', r.to);
  const s = q.toString();
  return `#${path}${s ? `?${s}` : ''}`;
};

export const href = {
  dashboard: '#/',
  upload: '#/upload',
  search: (params?: Record<string, string>) => `#/search${params ? `?${new URLSearchParams(params)}` : ''}`,
  setup: '#/setup',
  fridge: (id: number, r?: Partial<Range>) => withRange(`/fridge/${id}`, r),
  report: (id: number, r?: Partial<Range>) => withRange(`/fridge/${id}/report`, r),
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
