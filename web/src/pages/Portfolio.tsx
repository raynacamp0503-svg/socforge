import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { PortfolioData } from '../types';
import { useLive } from '../live';
import { SevBadge, fmtTime } from '../ui';

export default function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const { refreshKey } = useLive();

  useEffect(() => {
    api.portfolio().then(setData).catch(console.error);
  }, [refreshKey]);

  if (!data) return <div className="empty">Loading portfolio…</div>;

  return (
    <div>
      <div className="row">
        <div>
          <h1 className="page-title">Portfolio Mode</h1>
          <p className="page-sub">Everything you need to demo this project in interviews</p>
        </div>
        <span className="spacer" />
        <a href="/api/portfolio/export.md" download>
          <button className="primary">⬇ Export portfolio (Markdown)</button>
        </a>
      </div>

      <div className="grid stat-cards">
        <div className="stat-card"><div className="stat-value">{data.stats.completed}</div><div className="stat-label">Completed Investigations</div></div>
        <div className="stat-card"><div className="stat-value">{data.stats.techniques}</div><div className="stat-label">ATT&CK Techniques Covered</div></div>
        <div className="stat-card"><div className="stat-value">{data.stats.detections}</div><div className="stat-label">Detection Rules Authored</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--accent)' }}>{data.stats.avgScore ?? '—'}</div><div className="stat-label">Average Score</div></div>
      </div>

      <div className="panel mb">
        <h3 className="panel-title">Completed Investigations</h3>
        {data.completed.length ? (
          <table className="data">
            <thead><tr><th>#</th><th>Closed</th><th>Incident</th><th>Severity</th><th>Disposition</th><th>Score</th></tr></thead>
            <tbody>
              {data.completed.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td className="mono nowrap">{c.closedAt ? fmtTime(c.closedAt) : '—'}</td>
                  <td><Link to={`/cases/${c.id}`}>{c.title}</Link></td>
                  <td><SevBadge sev={c.severity} /></td>
                  <td>{c.disposition?.replace('_', ' ')}</td>
                  <td className="mono">{c.score != null ? `${c.score}/100` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">Close some cases to build your portfolio.</div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <h3 className="panel-title">Resume Bullets (auto-generated from your activity)</h3>
          <ul style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18 }}>
            {data.resumeBullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
        <div className="panel">
          <h3 className="panel-title">Interview Talking Points</h3>
          {data.talkingPoints.map((t, i) => (
            <details key={i} style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t.q}</summary>
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.6 }}>{t.a}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="panel mt">
        <h3 className="panel-title">📸 Screenshot Checklist for Your Portfolio</h3>
        <ol style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }} className="dim">
          <li>Dashboard with live charts populated (let the app run 10+ minutes first)</li>
          <li>Search console showing a query like <span className="mono">index=windows EventCode=4625</span> with expanded raw event</li>
          <li>Alert queue with mixed statuses and a live SLA countdown</li>
          <li>A case mid-investigation: checklist partially done, hint revealed, evidence attached</li>
          <li>The scored report view after closing a case (score breakdown + explanation)</li>
          <li>This portfolio page with your cumulative stats</li>
        </ol>
      </div>
    </div>
  );
}
