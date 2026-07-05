import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Detection, Scenario } from '../types';
import { useLive } from '../live';
import { SevBadge } from '../ui';

const SCENARIO_TEMPLATE = `{
  "key": "my-scenario",
  "name": "My Scenario",
  "title": "Something suspicious on {host} by {user}",
  "description": "Shown as the alert description.",
  "severity": "high",
  "difficulty": "intermediate",
  "detection": "index=windows EventCode=1234",
  "mitre": [{ "tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter" }],
  "objective": "What the analyst must figure out.",
  "checklist": ["Step 1", "Step 2"],
  "hints": ["Hint 1", "Hint 2"],
  "expectedEvidence": ["Evidence item 1"],
  "correctDisposition": "true_positive",
  "explanation": "Shown after the case is closed — the teaching moment.",
  "reportTemplate": "1. Response action one. 2. Response action two.",
  "events": [
    { "offsetSec": -300, "repeat": 5, "intervalSec": 10, "index": "windows",
      "sourcetype": "wineventlog", "event_code": "1234", "host": "{host}",
      "user": "{user}", "src_ip": "{attacker_ip}", "severity": "medium",
      "message": "Templated log line for {user} from {attacker_ip}" }
  ]
}`;

export default function Scenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [showTemplate, setShowTemplate] = useState(false);
  const nav = useNavigate();
  const { refreshKey } = useLive();

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(console.error);
    api.detections().then(setDetections).catch(console.error);
  }, [refreshKey]);

  const trigger = async (key: string) => {
    const r = await api.triggerScenario(key);
    nav(`/cases/${r.caseId}`);
  };

  return (
    <div>
      <h1 className="page-title">Scenarios & Detections</h1>
      <p className="page-sub">The alert engine fires a random scenario every 2–5 minutes. Trigger any scenario on demand to practice it.</p>

      <div className="panel mb">
        <h3 className="panel-title">Attack Scenarios ({scenarios.length})</h3>
        <table className="data">
          <thead><tr><th>Scenario</th><th>Severity</th><th>Difficulty</th><th>MITRE</th><th>Detection Logic</th><th></th></tr></thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.key}>
                <td><b>{s.name}</b><div className="dim" style={{ fontSize: 12, maxWidth: 380 }}>{s.objective}</div></td>
                <td><SevBadge sev={s.severity} /></td>
                <td>{s.difficulty}</td>
                <td className="mono" style={{ fontSize: 11 }}>{s.mitre.map((m) => m.technique).join(', ')}</td>
                <td className="mono" style={{ fontSize: 11, maxWidth: 220 }}>{s.detection}</td>
                <td><button className="small primary" onClick={() => trigger(s.key)}>▶ Trigger now</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel mb">
        <h3 className="panel-title">Saved Detections ({detections.length}) — evaluated against live events every 60s</h3>
        {detections.length ? (
          <table className="data">
            <thead><tr><th>Name</th><th>Query</th><th>Severity</th><th>Enabled</th><th></th></tr></thead>
            <tbody>
              {detections.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{d.query}</td>
                  <td><SevBadge sev={d.severity as never} /></td>
                  <td>
                    <button className="small" onClick={async () => {
                      const upd = await api.toggleDetection(d.id, !d.enabled);
                      setDetections((ds) => ds.map((x) => (x.id === d.id ? upd : x)));
                    }}>{d.enabled ? 'On' : 'Off'}</button>
                  </td>
                  <td><button className="small danger" onClick={async () => {
                    await api.deleteDetection(d.id);
                    setDetections((ds) => ds.filter((x) => x.id !== d.id));
                  }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No saved detections yet. Build a query in the Search console and click "Save as detection".</div>
        )}
      </div>

      <div className="panel">
        <h3 className="panel-title">Scenario Builder — add your own via JSON</h3>
        <p style={{ fontSize: 13 }} className="dim">
          Drop a <span className="mono">.json</span> file into <span className="mono">server/scenarios/</span> and restart the API.
          Placeholders like <span className="mono">{'{user}'}</span>, <span className="mono">{'{host}'}</span>, <span className="mono">{'{attacker_ip}'}</span>,{' '}
          <span className="mono">{'{c2_ip}'}</span>, <span className="mono">{'{dga_domain}'}</span> are filled with random entities each time the scenario fires.
          Each event supports <span className="mono">offsetSec</span> (relative to alert time), <span className="mono">repeat</span>, and <span className="mono">intervalSec</span>.
        </p>
        <button onClick={() => setShowTemplate(!showTemplate)}>{showTemplate ? 'Hide' : 'Show'} template</button>
        {showTemplate && <div className="raw-event mt">{SCENARIO_TEMPLATE}</div>}
      </div>
    </div>
  );
}
