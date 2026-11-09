// Hash routes (#/, #/upload): no router dependency (D17, D37). Hash URLs also work from `npm start`
// without any server-side fallback route.
import { useEffect, useState } from 'react';

export type Route = { page: 'dashboard' } | { page: 'upload' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/upload') return { page: 'upload' };
  return { page: 'dashboard' };
}

export const href = {
  dashboard: '#/',
  upload: '#/upload',
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
