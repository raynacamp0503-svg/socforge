import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { CaseDetail, CompleteResult, SocEvent } from '../types';
import EventTable from '../components/EventTable';
import { MitreChips, SevBadge, SlaTimer, StatusChip, fmtTime } from '../ui';

const DISPOSITIONS = [
  { value: 'true_positive', label: 'True Positive' },
  { value: 'false_positive', label: 'False Positive' },
  { value: 'benign', label: 'Benign' },
  { value: 'needs_escalation', label: 'Needs Escalation' },
];

export default function CasePage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [tabView, setTabView] = useState<'investigate' | 'notes' | 'report'>('investigate');
  const [hints, setHints] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [disposition, setDisposition] = useState('');
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api.caseDetail(id!).then((d) => {
      setDetail(d);
      setNotes(d.case.notes);
      if (d.case.status === 'closed') setTabView('report');
    }).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (err) return <div className="empty">{err}</div>;
  if (!detail) return <div className="empty">Loading case…</div>;
  const { case: c, training: t, events } = detail;
  const closed = c.status === 'closed';

  const toggleItem = async (i: number) => {
    if (closed) return;
    const r = await api.toggleChecklist(c.id, i);
    setDetail((d) => d && { ...d, case: { ...d.case, checklistState: r.checklistState } });
  };

  const getHint = async () => {
    try {
      const r = await api.getHint(c.id);
      setHints((h) => [...h, r.hint]);
      setDetail((d) => d && { ...d, case: { ...d.case, hintsUsed: r.hintsUsed } });
    } catch (e) {
      setErr('');
      window.alert((e as Error).message);
    }
  };

  const saveNotes = async () => {
    await api.patchCase(c.id, { notes });
    setNotesSaved(true);
  };

  const attachEvent = async (ev: SocEvent) => {
    const r = await api.addEvidence(c.id, { eventId: ev.id, note: `Event #${ev.id} (${ev.sourcetype}${ev.event_code ? ' ' + ev.event_code : ''})` });
    setDetail((d) => d && { ...d, case: { ...d.case, evidence: r.evidence } });
  };

  const attachNote = async () => {
    if (!evidenceNote.trim()) return;
    const r = await api.addEvidence(c.id, { note: evidenceNote.trim() });
    setEvidenceNote('');
    setDetail((d) => d && { ...d, case: { ...d.case, evidence: r.evidence } });
  };

  const complete = async () => {
    if (!disposition) return window.alert('Choose a disposition first.');
    if (!notesSaved) await saveNotes();
    const r = await api.completeCase(c.id, disposition);
    setResult(r);
    setTabView('report');
    load();
  };

  const setStatus = async (status: string) => {
    await api.patchCase(c.id, { status });
    load();
  };

  return (
    <div>
      <div className="row">
        <Link to="/queue">← Queue</Link>
        <h1 className="page-title" style={{ margin: 0 }}>Case #{c.id}: {c.title}</h1>
      </div>
      <div className="row mt mb">
        <SevBadge sev={c.severity} />
        <StatusChip status={c.status} />
        <span className="dim">Difficulty: <b>{t.difficulty}</b></span>
        <span className="dim">Scenario: <b>{t.scenarioName}</b></span>
        <span className="dim">Opened: <span className="mono">{fmtTime(c.createdAt)}</span></span>
        <span className="dim">SLA: <SlaTimer due={c.slaDue} closed={closed} /></span>
        <span className="spacer" />
        {!closed && (
          <>
            {c.status !== 'investigating' && <button onClick={() => setStatus('investigating')}>Start investigating</button>}
            {c.status !== 'escalated' && <button onClick={() => setStatus('escalated')}>Escalate</button>}
          </>
        )}
        {c.score != null && <span className="score-ring">{c.score}</span>}
      </div>

      <div className="tabs">
        <div className={`tab${tabView === 'investigate' ? ' active' : ''}`} onClick={() => setTabView('investigate')}>Investigate</div>
        <div className={`tab${tabView === 'notes' ? ' active' : ''}`} onClick={() => setTabView('notes')}>Notes & Evidence</div>
        <div className={`tab${tabView === 'report' ? ' active' : ''}`} onClick={() => setTabView('report')}>Report & Feedback</div>
      </div>

      {tabView === 'investigate' && (
        <div className="case-layout">
          <div>
            <div className="panel mb">
              <h3 className="panel-title">Alert Description</h3>
              <p style={{ marginTop: 0 }}>{c.description}</p>
              {c.detection && (
                <>
                  <h3 className="panel-title">Detection Logic</h3>
                  <div className="raw-event">{c.detection}</div>
                  <Link to={`/search?q=${encodeURIComponent(c.detection)}`}><button className="small">Run in Search ↗</button></Link>
                </>
              )}
            </div>
            <div className="panel">
              <h3 className="panel-title">Related Logs ({events.length})</h3>
              <EventTable events={events} onAttach={closed ? undefined : attachEvent} />
            </div>
          </div>

          <div>
            <div className="panel mb">
              <h3 className="panel-title">🎯 Investigation Objective</h3>
              <p style={{ margin: 0, fontSize: 13 }}>{t.objective}</p>
            </div>

            <div className="panel mb">
              <h3 className="panel-title">Analyst Checklist ({c.checklistState.filter(Boolean).length}/{t.checklist.length})</h3>
              {t.checklist.map((item, i) => (
                <label key={i} className={`checklist-item${c.checklistState[i] ? ' done' : ''}`}>
                  <input type="checkbox" checked={!!c.checklistState[i]} onChange={() => toggleItem(i)} disabled={closed} />
                  <span>{item}</span>
                </label>
              ))}
            </div>

            <div className="panel mb">
              <h3 className="panel-title">Hints ({c.hintsUsed}/{t.hintCount} used · −10 pts each)</h3>
              {hints.map((h, i) => <div key={i} className="hint-box">💡 {h}</div>)}
              {!closed && c.hintsUsed < t.hintCount && (
                <button onClick={getHint}>Reveal hint {c.hintsUsed + 1}</button>
              )}
              {c.hintsUsed >= t.hintCount && <div className="faint">No more hints.</div>}
            </div>

            <div className="panel mb">
              <h3 className="panel-title">MITRE ATT&CK</h3>
              <MitreChips mitre={c.mitre} />
            </div>

            {!closed && (
              <div className="panel" style={{ borderColor: 'var(--accent-dim)' }}>
                <h3 className="panel-title">Close Case</h3>
                <p className="dim" style={{ fontSize: 12 }}>
                  Scoring rubric: checklist 40 pts · evidence 20 pts · correct disposition 40 pts · −10 per hint.
                </p>
                <div className="row">
                  <select value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                    <option value="">— Disposition —</option>
                    {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <button className="primary" onClick={complete}>Submit & Score</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tabView === 'notes' && (
        <div className="case-layout">
          <div className="panel">
            <h3 className="panel-title">Analyst Notes</h3>
            <textarea
              style={{ width: '100%', minHeight: 220, fontFamily: 'var(--mono)', fontSize: 13 }}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
              placeholder="Timeline, observations, entity context, reasoning for your disposition…"
              disabled={closed}
            />
            {!closed && (
              <div className="row mt">
                <button className="primary" onClick={saveNotes} disabled={notesSaved}>{notesSaved ? 'Saved' : 'Save notes'}</button>
              </div>
            )}
          </div>
          <div>
            <div className="panel mb">
              <h3 className="panel-title">Evidence ({c.evidence.length})</h3>
              {c.evidence.map((ev, i) => (
                <div key={i} className="evidence-item">
                  <div>{ev.note}</div>
                  {ev.eventSummary && <div className="mono faint" style={{ marginTop: 4 }}>{ev.eventSummary}</div>}
                </div>
              ))}
              {!c.evidence.length && <div className="empty">Attach events from Related Logs, or add a note below.</div>}
              {!closed && (
                <div className="row mt">
                  <input type="text" style={{ flex: 1 }} placeholder="Evidence note…" value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && attachNote()} />
                  <button onClick={attachNote}>Add</button>
                </div>
              )}
            </div>
            <div className="panel">
              <h3 className="panel-title">Expected Evidence (rubric)</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {t.expectedEvidence.map((e, i) => <li key={i} className="dim">{e}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tabView === 'report' && (
        <div>
          {(result || closed) ? (
            <div className="case-layout">
              <div className="panel">
                <h3 className="panel-title">Incident Report (generated)</h3>
                <div className="report-md">{result?.report || c.report || 'No report.'}</div>
              </div>
              <div>
                <div className="panel mb">
                  <h3 className="panel-title">Score</h3>
                  <div className="score-ring">{result?.score ?? c.score ?? '—'}<span style={{ fontSize: 16, color: 'var(--text-dim)' }}>/100</span></div>
                  {(result?.breakdown || c.scoreBreakdown) && (
                    <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>
                      {Object.entries(result?.breakdown || c.scoreBreakdown!).map(([k, v]) => (
                        <li key={k} className="dim">
                          <b>{k}</b>: {'max' in v ? `${v.earned}/${(v as { max: number }).max}` : v.earned} — {v.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="panel">
                  <h3 className="panel-title">✅ What Was Really Happening</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>{result?.explanation || t.explanation}</p>
                  {(result?.correctDisposition || t.correctDisposition) && (
                    <p className="dim" style={{ fontSize: 12 }}>
                      Correct disposition: <b>{(result?.correctDisposition || t.correctDisposition)!.replace('_', ' ')}</b>
                      {c.disposition && <> · Your call: <b>{c.disposition.replace('_', ' ')}</b></>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">Complete the investigation (Investigate tab → Submit & Score) to unlock the report, score, and the full explanation of the attack.</div>
          )}
        </div>
      )}
    </div>
  );
}
