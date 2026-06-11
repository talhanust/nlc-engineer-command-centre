import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { OrgNavigator } from './OrgNavigator';
import { CommandPalette } from './CommandPalette';
import { useData } from '../data/DataContext';

export function AppLayout() {
  const { provider } = useData();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="layout">
      <CommandPalette />
      <header className="app-header">
        <div>
          {/* Global identity is NLC — never the client of one project. */}
          <div className="brand-org">NATIONAL LOGISTIC CORPORATION</div>
          <div className="brand-app">
            Engineer <span className="accent">Command Centre</span>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          <span className="pill">{provider.mode} mode</span>
          <button className="btn" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
            {theme === 'light' ? 'Dark' : 'Light'} theme
          </button>
        </div>
      </header>
      <div className="body">
        <aside className="sidebar">
          <OrgNavigator />
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
