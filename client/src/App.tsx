import { useEffect, useState } from 'react';
import { strings } from './strings.ts';

type Health = { state: 'checking' } | { state: 'ok'; node: string } | { state: 'down' };

export default function App() {
  const [health, setHealth] = useState<Health>({ state: 'checking' });

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body: { node: string }) => setHealth({ state: 'ok', node: body.node }))
      .catch(() => setHealth({ state: 'down' }));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold">{strings.appName}</h1>
      <p className="text-slate-600">{strings.tagline}</p>
      <p
        className={
          'mt-4 rounded p-3 text-sm ' +
          (health.state === 'ok'
            ? 'bg-green-100 text-green-900'
            : health.state === 'down'
              ? 'bg-red-100 text-red-900'
              : 'bg-slate-100 text-slate-700')
        }
      >
        {health.state === 'ok'
          ? strings.health.ok(health.node)
          : health.state === 'down'
            ? strings.health.down
            : strings.health.checking}
      </p>
    </main>
  );
}
