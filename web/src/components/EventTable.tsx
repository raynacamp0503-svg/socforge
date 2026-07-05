import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SocEvent } from '../types';
import { SevBadge, fmtTime } from '../ui';

const pivot = (field: string, value: string) => `/search?q=${encodeURIComponent(`${field}=${value}`)}`;

const PivotLink = ({ field, value }: { field: string; value: string | null }) =>
  value ? (
    <Link className="mono" to={pivot(field, value)} title={`Search ${field}=${value}`}>
      {value}
    </Link>
  ) : (
    <span className="faint">—</span>
  );

export default function EventTable({
  events,
  onAttach,
}: {
  events: SocEvent[];
  onAttach?: (ev: SocEvent) => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (!events.length) return <div className="empty">No events match.</div>;

  return (
    <table className="data">
      <thead>
        <tr>
          <th>Time</th>
          <th>Index</th>
          <th>Sourcetype</th>
          <th>Code</th>
          <th>Host</th>
          <th>User</th>
          <th>Src IP</th>
          <th>Sev</th>
          <th>Message</th>
          {onAttach && <th></th>}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <Fragment key={e.id}>
            <tr className="clickable" onClick={() => toggle(e.id)}>
              <td className="mono nowrap">{fmtTime(e.ts)}</td>
              <td className="mono">{e.index_name}</td>
              <td className="mono dim">{e.sourcetype}</td>
              <td className="mono">{e.event_code || ''}</td>
              <td onClick={(ev) => ev.stopPropagation()}><PivotLink field="host" value={e.host} /></td>
              <td onClick={(ev) => ev.stopPropagation()}><PivotLink field="user" value={e.user} /></td>
              <td onClick={(ev) => ev.stopPropagation()}><PivotLink field="src_ip" value={e.src_ip} /></td>
              <td><SevBadge sev={e.severity} /></td>
              <td className="dim" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.message}
              </td>
              {onAttach && (
                <td onClick={(ev) => ev.stopPropagation()}>
                  <button className="small" onClick={() => onAttach(e)}>+ Evidence</button>
                </td>
              )}
            </tr>
            {open.has(e.id) && (
              <tr>
                <td colSpan={onAttach ? 10 : 9}>
                  <div className="raw-event">{JSON.stringify(e, null, 2)}</div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
