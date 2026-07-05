import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Case } from '../types';
import { useLive } from '../live';
import { SevBadge, SlaTimer, StatusChip, fmtTime } from '../ui';

const TABS = ['all', 'new', 'investigating', 'escalated', 'closed'] as const;

export default function Queue() {
  const [cases, setCases] = useState<Case[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>('all');
  const { refreshKey } = useLive();

  useEffect(() => {
    api.cases(tab === 'all' ? undefined : tab).then(setCases).catch(console.error);
  }, [tab, refreshKey]);

  const setStatus = async (c: Case, status: string) => {
    await api.patchCase(c.id, { status });
    setCases((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: status as Case['status'] } : x)));
  };

  return (
    <div>
      <h1 className="page-title">Alert Queue</h1>
      <p className="page-sub">Triage incoming alerts — every alert is an interactive training case</p>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>#</th><th>Created</th><th>Alert</th><th>Severity</th><th>Status</th><th>SLA</th><th>Score</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td className="mono nowrap">{fmtTime(c.createdAt)}</td>
                <td><Link to={`/cases/${c.id}`}>{c.title}</Link></td>
                <td><SevBadge sev={c.severity} /></td>
                <td><StatusChip status={c.status} /></td>
                <td><SlaTimer due={c.slaDue} closed={c.status === 'closed'} /></td>
                <td className="mono">{c.score != null ? `${c.score}/100` : '—'}</td>
                <td className="nowrap">
                  {c.status === 'new' && <button className="small" onClick={() => setStatus(c, 'investigating')}>Start</button>}{' '}
                  <Link to={`/cases/${c.id}`}><button className="small primary">Open</button></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cases.length && <div className="empty">No cases in this view. Live alerts arrive every few minutes — or trigger one from the Scenarios page.</div>}
      </div>
    </div>
  );
}
