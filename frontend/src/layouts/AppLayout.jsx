import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import useAppStore from '../stores/useAppStore';
import { T, S } from '../constants';
import ProjectSearch from '../components/shared/ProjectSearch';

export default function AppLayout() {
  const { loading, error, refresh, refreshing, mktData, projList, projIndex, cmpPool, proj, bootstrap } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isMarket = location.pathname === '/';
  const isPortfolio = location.pathname === '/portfolio';
  const isProject = location.pathname.startsWith('/project/');

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const handleProjectSelect = (name) => {
    useAppStore.getState().selectProject(name);
    navigate(`/project/${encodeURIComponent(name)}`);
  };

  if (loading) return (
    <Shell>
      <div role="status" aria-label="Loading dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner />
          <div style={{ fontSize: T.lg, fontWeight: 600, marginBottom: 8 }}>Loading Dashboard...</div>
          <div style={{ ...S.sub }}>Preparing your analytics</div>
        </div>
      </div>
    </Shell>
  );

  if (error) return (
    <Shell>
      <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 16, color: T.red, fontWeight: 700 }}>Error</div>
          <div style={{ fontSize: T.lg, fontWeight: 600, marginBottom: 8, color: T.red }}>Failed to Load Data</div>
          <div style={{ ...S.sub, marginBottom: 16 }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: T.lg, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      </div>
    </Shell>
  );

  return (
    <Shell>
      {/* Skip to content link (accessibility) */}
      <a href="#main-content" style={{ position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden', zIndex: 999 }}
        onFocus={e => { e.target.style.cssText = 'position:fixed;top:8px;left:8px;z-index:999;background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;'; }}
        onBlur={e => { e.target.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;'; }}>
        Skip to main content
      </a>

      {/* ═══ TOP NAV BAR ═══ */}
      <nav aria-label="Main navigation" style={{ background: '#fff', borderBottom: '1px solid #e5e5ee', padding: '0 24px', display: 'flex', alignItems: 'center', height: 50, position: 'sticky', top: 0, zIndex: 50 }}>
        <NavLink to="/" aria-label="PropIntel home" style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', color: T.text, marginRight: 24, textDecoration: 'none' }}>PropIntel</NavLink>

        <NavLink to="/" end style={({ isActive }) => navTab(isActive)} aria-current={isMarket ? 'page' : undefined}>Market</NavLink>
        <NavLink to="/portfolio" style={({ isActive }) => navTab(isActive)} aria-current={isPortfolio ? 'page' : undefined}>Portfolio</NavLink>

        {/* Compact search in nav when viewing a project */}
        {isProject && <div style={{ marginLeft: 16, flex: 1, maxWidth: 360 }}>
          <ProjectSearch value={proj} projList={projList} cmpPool={cmpPool} projIndex={projIndex} onChange={handleProjectSelect} compact />
        </div>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={refresh} disabled={refreshing} aria-label={refreshing ? 'Refreshing data' : 'Refresh data'}
            style={{ background: 'none', border: '1px solid #e5e5ee', borderRadius: 6, padding: '5px 10px', color: refreshing ? T.textFaint : T.textSub, fontSize: 12, cursor: refreshing ? 'wait' : 'pointer' }}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span aria-label={mktData ? 'Data loaded' : 'Data loading'} style={{ width: 6, height: 6, borderRadius: '50%', background: mktData ? '#059669' : T.amber }} />
          {mktData?.lastUpdated && <span style={{ color: T.textMute, fontSize: 10 }}>
            {new Date(mktData.lastUpdated).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>}
        </div>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <main id="main-content" role="main">
        <Outlet />
      </main>
    </Shell>
  );
}

// ── Style helpers ──
const navTab = (active) => ({
  background: 'none', border: 'none', textDecoration: 'none',
  color: active ? '#2563eb' : T.textSub, fontSize: 13, fontWeight: 500,
  padding: '14px 12px',
  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
  marginBottom: -1,
});

// ── Shell ──
function Shell({ children }) {
  return (
    <div style={{ fontFamily: T.sans, background: T.bg, minHeight: '100vh', color: T.text }}>
      <style>{`
        * { margin:0; padding:0; box-sizing:border-box; }
        html { -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; }
        ::selection { background: #dbeafe; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:#c0c0d0; border-radius:2px; }
        .s { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:10px; margin-bottom:16px; }
        .g2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .g3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
        @media(max-width:900px) { .g2,.g3 { grid-template-columns:1fr; } .s { grid-template-columns:repeat(2,1fr); } }
        select { background:#fff; color:${T.text}; border:1px solid #d1d5db; border-radius:6px; padding:8px 12px; font-size:${T.lg}px; cursor:pointer; outline:none; font-family:${T.sans}; }
        select option { background:#fff; }
        table { width:100%; border-collapse:collapse; font-size:${T.base}px; font-family:${T.sans}; }
        th { color:${T.textMute}; font-weight:600; padding:10px 12px; text-align:left; border-bottom:1px solid #e5e5ee; letter-spacing:0.04em; text-transform:uppercase; font-size:${T.sm}px; }
        td { padding:8px 12px; border-bottom:1px solid #f5f6f8; }
        tr:hover { background:#f8f9fb; }
        button { font-family:${T.sans}; }
        input { font-family:${T.sans}; }
        svg text { font-family:${T.sans}; }
        @keyframes spin { to { transform:rotate(360deg) } }
        :focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
      `}</style>
      {children}
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 40, height: 40, border: '3px solid #e5e5ee', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />;
}
