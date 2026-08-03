import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { AppProviders } from './providers';
import { HomePage } from '@/pages/HomePage';
import { ArchiveIndexPage } from '@/pages/ArchiveIndexPage';
import { ArchiveRecordPage } from '@/pages/ArchiveRecordPage';
import { OperatorPage } from '@/pages/OperatorPage';
import { LogsPage } from '@/pages/LogsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// The signal page is the hidden narrative branch — split it out of the
// main bundle so it is only fetched when someone actually finds it.
const SignalPage = lazy(() =>
  import('@/pages/SignalPage').then((module) => ({ default: module.SignalPage })),
);

function RouteFallback(): React.JSX.Element {
  return (
    <div className="shell-inner page">
      <p className="mono-label">loading record…</p>
    </div>
  );
}

/** Providers live inside the router so they can observe the location. */
function RootLayout(): React.JSX.Element {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: (
      <AppProviders>
        <NotFoundPage />
      </AppProviders>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'archive', element: <ArchiveIndexPage /> },
      { path: 'archive/:slug', element: <ArchiveRecordPage /> },
      { path: 'operator', element: <OperatorPage /> },
      { path: 'logs', element: <LogsPage /> },
      {
        path: 'signal',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <SignalPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
