import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { LiveProvider, useLive } from './live';
import { CoachPanel, CoachProvider, useCoach } from './coach';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import Queue from './pages/Queue';
import CasePage from './pages/CasePage';
import Scenarios from './pages/Scenarios';
import Portfolio from './pages/Portfolio';

function Shell() {
  const { refreshKey } = useLive();
  const coach = useCoach();
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    api.cases().then((cs) => setOpenCount(cs.filter((c) => c.status !== 'closed').length)).catch(() => {});
  }, [refreshKey]);

  const links = [
    { to: '/', label: 'Dashboard', icon: '◧' },
    { to: '/search', label: 'Search', icon: '⌕' },
    { to: '/queue', label: 'Alert Queue', icon: '☰', badge: openCount },
    { to: '/scenarios', label: 'Scenarios', icon: '⚙' },
    { to: '/portfolio', label: 'Portfolio', icon: '★' },
  ];

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="logo">
          SOC<span className="forge">FORGE</span>
          <div className="logo-sub">Analyst Training Range</div>
        </div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span>{l.icon}</span> {l.label}
            {l.badge ? <span className="nav-badge">{l.badge}</span> : null}
          </NavLink>
        ))}
        <button className={`coach-toggle${coach.enabled ? ' on' : ''}`} onClick={coach.toggle}>
          🎓 Training Coach: {coach.enabled ? 'ON' : 'OFF'}
        </button>
        <div className="sidebar-footer">
          <div><span className="live-dot" />Live telemetry active</div>
          <div className="mt">Simulated environment.<br />All log data is synthetic — defensive training only.</div>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/cases/:id" element={<CasePage />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/portfolio" element={<Portfolio />} />
        </Routes>
      </main>
      <CoachPanel />
    </div>
  );
}

export default function App() {
  return (
    <LiveProvider>
      <CoachProvider>
        <Shell />
      </CoachProvider>
    </LiveProvider>
  );
}
