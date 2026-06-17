import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { OrgNavigator } from './OrgNavigator';
import { CommandPalette } from './CommandPalette';
import { ProjectDrawerHost } from './ProjectDrawerHost';
import { DockProvider, DockRail } from './Dock';
import { RouteFade } from './RouteFade';
import { useData } from '../data/DataContext';
import { useUiState } from '../state/UiState';

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function AppLayout() {
  const { provider } = useData();
  const {
    theme, setTheme, sidebarOpen, toggleSidebar, sidebarWidth, setSidebarWidth,
    zoom, setZoom, density, presentation, setPresentation, setLastNode,
  } = useUiState();
  const navigate = useNavigate();
  const location = useLocation();
  const [isFull, setIsFull] = useState(false);
  const mouse = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Remember last visited node so the app reopens where the user left off.
  useEffect(() => {
    const m = location.pathname.match(/^\/node\/([^/]+)/);
    if (m) setLastNode(m[1]);
  }, [location.pathname, setLastNode]);

  // ---- Keyboard layer ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && presentation) { setPresentation(false); return; }
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') { e.preventDefault(); toggleSidebar(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom + 0.1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom - 0.1); }
      else if (e.key === 'g') { e.preventDefault(); window.dispatchEvent(new CustomEvent('nlc:command-palette')); }
      else if (e.key === 'f') {
        // Expand the focusable panel currently under the pointer.
        const el = document.elementFromPoint(mouse.current.x, mouse.current.y) as HTMLElement | null;
        const panel = el?.closest('.focusable') as HTMLElement | null;
        const btn = panel?.querySelector('.focus-btn') as HTMLButtonElement | null;
        if (btn) { e.preventDefault(); btn.click(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('keydown', onKey); };
  }, [presentation, setPresentation, toggleSidebar, setZoom, zoom]);

  // ---- Sidebar resize ----
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add('col-resizing');
    const onMove = (ev: MouseEvent) => { if (dragging.current) setSidebarWidth(ev.clientX); };
    const onUp = () => {
      dragging.current = false;
      document.body.classList.remove('col-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => { /* unsupported */ });
  }

  const layoutClass = [
    'layout',
    sidebarOpen ? '' : 'sidebar-collapsed',
    `density-${density}`,
    presentation ? 'presentation' : '',
  ].filter(Boolean).join(' ');

  const contentZoom = zoom * (presentation ? 1.12 : 1);

  return (
    <div className={layoutClass} style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}>
      <CommandPalette />
      <ProjectDrawerHost />
      {presentation && (
        <button className="exit-presentation btn" onClick={() => setPresentation(false)} aria-label="Exit presentation mode">
          ✕ Exit presentation
        </button>
      )}
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-btn header-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div>
            <div className="brand-org">NATIONAL LOGISTIC CORPORATION</div>
            <div className="brand-app">Engineer <span className="accent">Command Centre</span></div>
          </div>
        </div>
        <div className="header-right">
          <div className="zoom-control" role="group" aria-label="Content zoom">
            <button className="icon-btn" onClick={() => setZoom(zoom - 0.1)} disabled={zoom <= 0.8} aria-label="Zoom out" title="Zoom out">−</button>
            <button className="zoom-value" onClick={() => setZoom(1)} aria-label="Reset zoom" title="Reset to 100%">{Math.round(zoom * 100)}%</button>
            <button className="icon-btn" onClick={() => setZoom(zoom + 0.1)} disabled={zoom >= 1.4} aria-label="Zoom in" title="Zoom in">+</button>
          </div>
          <button className="icon-btn" onClick={() => setPresentation(true)} aria-label="Enter presentation mode" title="Presentation mode">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
            </svg>
          </button>
          <button className="icon-btn" onClick={toggleFullscreen} aria-label={isFull ? 'Exit full screen' : 'Enter full screen'} aria-pressed={isFull} title={isFull ? 'Exit full screen' : 'Full screen'}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isFull ? <path d="M9 3v6H3M21 9h-6V3M3 15h6v6M15 21v-6h6" /> : <path d="M8 3H3v5M21 8V3h-5M3 16v5h5M16 21h5v-5" />}
            </svg>
          </button>
          <button className="btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          <span className="pill">{provider.mode} mode</span>
          <button className="btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Dark' : 'Light'} theme
          </button>
        </div>
      </header>
      <DockProvider>
        <div className="body">
          {sidebarOpen && <div className="sidebar-scrim no-print" onClick={toggleSidebar} aria-hidden="true" />}
          <aside className="sidebar" aria-hidden={!sidebarOpen}>
            <OrgNavigator />
            <div className="sidebar-resize no-print" onMouseDown={startDrag} role="separator" aria-label="Resize sidebar" title="Drag to resize" />
          </aside>
          <main className="content content-flex" style={{ zoom: contentZoom }}>
            <div className="content-inner">
              <RouteFade><Outlet /></RouteFade>
            </div>
            <DockRail />
          </main>
        </div>
      </DockProvider>
    </div>
  );
}
