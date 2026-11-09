import { strings } from './strings.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-baseline gap-2 px-4 py-3">
          <h1 className="shrink-0 whitespace-nowrap text-lg font-bold">{strings.appName}</h1>
          <p className="min-w-0 truncate text-sm text-slate-500">{strings.tagline}</p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-4">
        <DashboardPage />
      </main>
    </div>
  );
}
