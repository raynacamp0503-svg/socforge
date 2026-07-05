import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { SocEvent } from '../types';
import EventTable from '../components/EventTable';

const RANGES: { label: string; minutes: number | null }[] = [
  { label: 'Last 15 minutes', minutes: 15 },
  { label: 'Last hour', minutes: 60 },
  { label: 'Last 4 hours', minutes: 240 },
  { label: 'Last 24 hours', minutes: 1440 },
  { label: 'Last 7 days', minutes: 10080 },
  { label: 'All time', minutes: null },
];

const EXAMPLES = [
  'index=windows EventCode=4625',
  'sourcetype=sysmon process_name=powershell.exe',
  'severity=high user=*',
  'index=network dest_ip=147.78.47.93',
  'index=proxy POST',
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || 'index=windows EventCode=4625');
  const [range, setRange] = useState(3);
  const [events, setEvents] = useState<SocEvent[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const run = async (q = query) => {
    setRunning(true);
    setError('');
    setSaveMsg('');
    try {
      const min = RANGES[range].minutes;
      const res = await api.search(q, min ? Date.now() - min * 60000 : undefined);
      setEvents(res.events);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  // Support pivot links (/search?q=...) from other pages.
  useEffect(() => {
    const q = params.get('q');
    if (q) {
      setQuery(q);
      run(q);
      setParams({}, { replace: true });
    } else {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')]);

  const saveDetection = async () => {
    const name = window.prompt('Detection name:', 'My detection');
    if (!name) return;
    const severity = window.prompt('Severity (low / medium / high / critical):', 'medium') || 'medium';
    await api.saveDetection(name, query, severity);
    setSaveMsg(`Saved detection "${name}" — it now runs every 60s against live events (see Scenarios page).`);
  };

  return (
    <div>
      <h1 className="page-title">Search Console</h1>
      <p className="page-sub">Field-based query language · <span className="mono">field=value</span> pairs, <span className="mono">*</span> wildcards, free text</p>

      <div className="row mb">
        <input
          className="search-input"
          style={{ flex: 1 }}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="index=windows EventCode=4625 user=*"
          spellCheck={false}
        />
        <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
          {RANGES.map((r, i) => (
            <option key={r.label} value={i}>{r.label}</option>
          ))}
        </select>
        <button className="primary" onClick={() => run()} disabled={running}>
          {running ? 'Searching…' : '⌕ Search'}
        </button>
        <button onClick={saveDetection} title="Save this query as a live detection rule">💾 Save as detection</button>
      </div>

      <div className="chips">
        {EXAMPLES.map((ex) => (
          <span key={ex} className="chip" onClick={() => { setQuery(ex); run(ex); }}>{ex}</span>
        ))}
      </div>

      {error && <div className="hint-box" style={{ borderColor: 'var(--critical)', color: 'var(--critical)' }}>{error}</div>}
      {saveMsg && <div className="hint-box">{saveMsg}</div>}

      {events && (
        <div className="panel mt">
          <h3 className="panel-title">{events.length} events {events.length >= 500 ? '(capped at 500 — narrow your search)' : ''}</h3>
          <EventTable events={events} />
        </div>
      )}
    </div>
  );
}
