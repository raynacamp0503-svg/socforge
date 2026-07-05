import { useEffect, useState } from 'react';
import type { MitreMapping, Severity } from './types';

export const SevBadge = ({ sev }: { sev: Severity | string }) => (
  <span className={`sev sev-${sev}`}>{sev}</span>
);

export const StatusChip = ({ status }: { status: string }) => (
  <span className={`status-chip st-${status}`}>{status}</span>
);

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

export function SlaTimer({ due, closed }: { due: number; closed?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  if (closed) return <span className="sla ok">—</span>;
  const ms = due - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const str = `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
  const cls = ms < 0 ? 'overdue' : ms < 15 * 60000 ? 'warning' : 'ok';
  return <span className={`sla ${cls}`}>{ms < 0 ? `-${str}` : str}</span>;
}

export const MitreChips = ({ mitre }: { mitre: MitreMapping[] }) => (
  <div>
    {mitre.map((m) => (
      <a
        key={m.technique}
        className="mitre-chip"
        href={`https://attack.mitre.org/techniques/${m.technique.replace('.', '/')}/`}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: 'none' }}
      >
        <span className="mitre-id">{m.technique}</span>
        <span className="mitre-name">{m.name}</span>
        <span className="mitre-tactic">{m.tactic}</span>
      </a>
    ))}
  </div>
);

export function TopList({ items }: { items: { key: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  if (!items.length) return <div className="empty">No data yet</div>;
  return (
    <div>
      {items.map((i) => (
        <div className="top-row" key={i.key}>
          <span className="top-key" title={i.key}>{i.key}</span>
          <div className="top-bar-track">
            <div className="top-bar" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <span className="top-count">{i.count}</span>
        </div>
      ))}
    </div>
  );
}
