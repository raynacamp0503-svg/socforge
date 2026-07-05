import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import { api } from '../api';
import type { DashboardData } from '../types';
import { useLive } from '../live';
import { MitreChips, SevBadge, StatusChip, TopList, fmtTime } from '../ui';

const SEV_COLORS: Record<string, string> = {
  critical: '#ff4d6d', high: '#ff8a3d', medium: '#ffd166', low: '#4cc9f0', info: '#8494ab',
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { refreshKey } = useLive();

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
    const iv = setInterval(() => api.dashboard().then(setData).catch(() => {}), 30000);
    return () => clearInterval(iv);
  }, [refreshKey]);

  if (!data) return <div className="empty">Loading security posture…</div>;

  const sevData = Object.entries(data.severityCounts).map(([name, value]) => ({ name, value }));
  const timeline = data.timeline.map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div>
      <h1 className="page-title">Security Operations Dashboard</h1>
      <p className="page-sub">Last 24 hours · simulated telemetry · auto-refreshing</p>

      <div className="grid stat-cards">
        <div className="stat-card"><div className="stat-value">{data.alerts24h}</div><div className="stat-label">Alerts (24h)</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--critical)' }}>{data.openCases}</div><div className="stat-label">Open Cases</div></div>
        <div className="stat-card"><div className="stat-value">{data.events24h.toLocaleString()}</div><div className="stat-label">Events (24h)</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--accent)' }}>{data.avgScore ?? '—'}</div><div className="stat-label">Avg Investigation Score</div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="panel">
          <h3 className="panel-title">Alert & Event Volume Over Time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeline}>
              <CartesianGrid stroke="#1f2a3f" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: '#5a6a82', fontSize: 11 }} interval={7} />
              <YAxis yAxisId="ev" tick={{ fill: '#5a6a82', fontSize: 11 }} />
              <YAxis yAxisId="al" orientation="right" tick={{ fill: '#5a6a82', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#151d2e', border: '1px solid #2c3b57', borderRadius: 6 }} labelStyle={{ color: '#d7e0ee' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="ev" type="monotone" dataKey="events" stroke="#37d0a2" fill="rgba(55,208,162,0.12)" name="Events" />
              <Area yAxisId="al" type="monotone" dataKey="alerts" stroke="#ff4d6d" fill="rgba(255,77,109,0.18)" name="Alerts" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3 className="panel-title">Alert Severity (24h)</h3>
          {sevData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sevData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {sevData.map((s) => (
                    <Cell key={s.name} fill={SEV_COLORS[s.name] || '#8494ab'} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#151d2e', border: '1px solid #2c3b57', borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">No alerts in the last 24h</div>
          )}
        </div>
      </div>

      <div className="grid mt" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="panel"><h3 className="panel-title">Top Source IPs</h3><TopList items={data.top.src_ip} /></div>
        <div className="panel"><h3 className="panel-title">Top Users</h3><TopList items={data.top.user} /></div>
        <div className="panel"><h3 className="panel-title">Top Hosts</h3><TopList items={data.top.host} /></div>
      </div>

      <div className="grid mt" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <h3 className="panel-title">Recent Notable Events</h3>
          <table className="data">
            <thead><tr><th>Time</th><th>Alert</th><th>Sev</th><th>Status</th></tr></thead>
            <tbody>
              {data.notables.map((c) => (
                <tr key={c.id}>
                  <td className="mono nowrap">{fmtTime(c.createdAt)}</td>
                  <td><Link to={`/cases/${c.id}`}>{c.title}</Link></td>
                  <td><SevBadge sev={c.severity} /></td>
                  <td><StatusChip status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3 className="panel-title">MITRE ATT&CK Coverage ({data.mitre.length} techniques)</h3>
          <MitreChips mitre={data.mitre} />
        </div>
      </div>
    </div>
  );
}
