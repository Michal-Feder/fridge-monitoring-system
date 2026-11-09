import { strings } from './strings.ts';
import { href, useRoute } from './router.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { FridgePage } from './pages/FridgePage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { SetupPage } from './pages/SetupPage.tsx';

type NavPage = 'dashboard' | 'upload' | 'search' | 'setup';
const NAV: { page: NavPage; href: string; label: string }[] = [
  { page: 'dashboard', href: href.dashboard, label: strings.nav.dashboard },
  { page: 'upload', href: href.upload, label: strings.nav.upload },
  { page: 'search', href: href.search(), label: strings.nav.search },
  { page: 'setup', href: href.setup, label: strings.nav.setup },
];

export default function App() {
  const route = useRoute();
  // the fridge page and its report belong to the dashboard tab
  const active: NavPage = route.page === 'fridge' || route.page === 'report' ? 'dashboard' : route.page;
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white print:hidden">
        {/* phone: title on one row, the four tabs on a full-width row below; sm and up: one row */}
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2">
          <h1 className="shrink-0 whitespace-nowrap text-lg font-bold">{strings.appName}</h1>
          {/* the tagline gives way first: on a phone the navigation matters more */}
          <p className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 md:block">{strings.tagline}</p>
          <nav aria-label={strings.nav.label} className="grid w-full grid-cols-4 gap-1 sm:ml-auto sm:flex sm:w-auto">
            {NAV.map((n) => (
              <a
                key={n.page}
                href={n.href}
                aria-current={active === n.page ? 'page' : undefined}
                className={`rounded-md px-2 py-1.5 text-center text-sm font-medium sm:px-3 ${active === n.page ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
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
        ) : route.page === 'search' ? (
          <SearchPage query={route.query} />
        ) : route.page === 'setup' ? (
          <SetupPage />
        ) : (
          <DashboardPage />
        )}
      </main>
    </div>
  );
}
