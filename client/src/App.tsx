import { strings } from './strings.ts';
import { href, useRoute } from './router.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { FridgePage } from './pages/FridgePage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';

const NAV: { page: 'dashboard' | 'upload'; href: string; label: string }[] = [
  { page: 'dashboard', href: href.dashboard, label: strings.nav.dashboard },
  { page: 'upload', href: href.upload, label: strings.nav.upload },
];

export default function App() {
  const route = useRoute();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2">
          <h1 className="shrink-0 whitespace-nowrap text-lg font-bold">{strings.appName}</h1>
          {/* the tagline gives way first: on a phone the navigation matters more */}
          <p className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 sm:block">{strings.tagline}</p>
          <nav aria-label={strings.nav.label} className="ml-auto flex shrink-0 gap-1">
            {NAV.map((n) => (
              <a
                key={n.page}
                href={n.href}
                aria-current={route.page === n.page ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${route.page === n.page ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-4 print:max-w-none print:p-0">
        {route.page === 'upload' ? (
          <UploadPage />
        ) : route.page === 'fridge' ? (
          <FridgePage key={route.id} id={route.id} range={route.range} />
        ) : route.page === 'report' ? (
          <ReportPage key={route.id} id={route.id} range={route.range} />
        ) : (
          <DashboardPage />
        )}
      </main>
    </div>
  );
}
