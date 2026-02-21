import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import AppLayout from './layouts/AppLayout';

// ── Lazy-loaded route pages (code splitting) ──
const MarketPage = lazy(() => import('./pages/MarketPage'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));

function PageFallback() {
  return (
    <div role="status" aria-label="Loading page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #e5e5ee', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Suspense fallback={<PageFallback />}><MarketPage /></Suspense>} />
            <Route path="project/:name" element={<Suspense fallback={<PageFallback />}><ProjectPage /></Suspense>} />
            <Route path="portfolio" element={<Suspense fallback={<PageFallback />}><PortfolioPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
