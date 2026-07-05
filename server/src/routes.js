import { Router } from 'express';
import { db, jparse } from './db.js';
import { runSearch } from './search.js';
import { getScenarios } from './scenarios.js';
import { triggerScenario, trainingFor, computeScore, generateReport, isPaused, setPaused } from './engine.js';
import { broadcast } from './sse.js';

export const router = Router();

const caseWithAlert = `
  SELECT c.*, a.title, a.severity, a.description, a.scenario_key, a.detection, a.mitre, a.entities, a.created_at AS alert_created_at
  FROM cases c JOIN alerts a ON a.id = c.alert_id`;

function shapeCase(row) {
  return {
    id: row.id, alertId: row.alert_id, title: row.title, severity: row.severity,
    description: row.description, scenarioKey: row.scenario_key, detection: row.detection,
    mitre: jparse(row.mitre, []), entities: jparse(row.entities, {}),
    status: row.status, priority: row.priority, disposition: row.disposition,
    slaDue: row.sla_due, notes: row.notes, evidence: jparse(row.evidence, []),
    checklistState: jparse(row.checklist_state, []), hintsUsed: row.hints_used,
    score: row.score, scoreBreakdown: jparse(row.score_breakdown, null), report: row.report,
    createdAt: row.created_at, closedAt: row.closed_at,
  };
}

// ---------- Engine control ----------
router.get('/engine/status', (req, res) => res.json({ paused: isPaused() }));

router.post('/engine/pause', (req, res) => {
  setPaused(req.body?.paused);
  broadcast('engine', { paused: isPaused() });
  res.json({ paused: isPaused() });
});

// ---------- Search ----------
router.get('/search', (req, res) => {
  try {
    const events = runSearch(req.query.q || '', {
      earliest: req.query.earliest, latest: req.query.latest, limit: req.query.limit,
    });
    res.json({ count: events.length, events: events.map((e) => ({ ...e, extra: jparse(e.extra, {}) })) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Dashboard stats ----------
router.get('/stats/dashboard', (req, res) => {
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;

  const severityCounts = {};
  for (const r of db.prepare(`SELECT severity, COUNT(*) c FROM alerts WHERE created_at >= ? GROUP BY severity`).all(dayAgo)) {
    severityCounts[r.severity] = r.c;
  }
  const openCases = db.prepare(`SELECT COUNT(*) c FROM cases WHERE status != 'closed'`).get().c;
  const events24h = db.prepare(`SELECT COUNT(*) c FROM events WHERE ts >= ?`).get(dayAgo).c;
  const alerts24h = db.prepare(`SELECT COUNT(*) c FROM alerts WHERE created_at >= ?`).get(dayAgo).c;
  const avgScoreRow = db.prepare(`SELECT AVG(score) s FROM cases WHERE score IS NOT NULL`).get();

  const bucket = 30 * 60 * 1000;
  const timelineMap = new Map();
  for (let t = Math.floor(dayAgo / bucket) * bucket; t <= now; t += bucket) timelineMap.set(t, { t, events: 0, alerts: 0 });
  for (const r of db.prepare(`SELECT (ts/${bucket})*${bucket} b, COUNT(*) c FROM events WHERE ts >= ? GROUP BY b`).all(dayAgo)) {
    if (timelineMap.has(r.b)) timelineMap.get(r.b).events = r.c;
  }
  for (const r of db.prepare(`SELECT (created_at/${bucket})*${bucket} b, COUNT(*) c FROM alerts WHERE created_at >= ? GROUP BY b`).all(dayAgo)) {
    if (timelineMap.has(r.b)) timelineMap.get(r.b).alerts = r.c;
  }

  const top = (col) =>
    db.prepare(`SELECT ${col} k, COUNT(*) c FROM events WHERE ts >= ? AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY c DESC LIMIT 8`)
      .all(dayAgo).map((r) => ({ key: r.k, count: r.c }));

  const mitre = {};
  for (const r of db.prepare(`SELECT mitre FROM alerts`).all()) {
    for (const m of jparse(r.mitre, [])) {
      const id = m.technique;
      if (!mitre[id]) mitre[id] = { ...m, count: 0 };
      mitre[id].count++;
    }
  }

  const notables = db.prepare(`${caseWithAlert} ORDER BY c.created_at DESC LIMIT 8`).all().map(shapeCase);

  res.json({
    severityCounts, openCases, events24h, alerts24h,
    avgScore: avgScoreRow.s != null ? Math.round(avgScoreRow.s) : null,
    timeline: [...timelineMap.values()],
    top: { src_ip: top('src_ip'), user: top('"user"'), host: top('host') },
    mitre: Object.values(mitre).sort((a, b) => b.count - a.count),
    notables,
  });
});

// ---------- Cases ----------
router.get('/cases', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare(`${caseWithAlert} WHERE c.status = ? ORDER BY c.created_at DESC LIMIT 200`).all(status)
    : db.prepare(`${caseWithAlert} ORDER BY (c.status = 'closed'), c.created_at DESC LIMIT 200`).all();
  res.json(rows.map(shapeCase));
});

router.get('/cases/:id', (req, res) => {
  const row = db.prepare(`${caseWithAlert} WHERE c.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Case not found' });
  const kase = shapeCase(row);
  const sc = trainingFor(row.scenario_key);
  const events = db.prepare(`SELECT * FROM events WHERE alert_id = ? ORDER BY ts ASC LIMIT 500`).all(row.alert_id)
    .map((e) => ({ ...e, extra: jparse(e.extra, {}) }));
  res.json({
    case: kase,
    events,
    training: {
      scenarioName: sc.name,
      difficulty: sc.difficulty || 'intermediate',
      objective: sc.objective,
      checklist: sc.checklist,
      hintCount: (sc.hints || []).length,
      expectedEvidence: sc.expectedEvidence || [],
      mitre: sc.mitre || [],
      completed: kase.status === 'closed',
      // Only reveal the answer/explanation after the case is closed.
      explanation: kase.status === 'closed' ? sc.explanation : null,
      correctDisposition: kase.status === 'closed' ? sc.correctDisposition : null,
    },
  });
});

router.patch('/cases/:id', (req, res) => {
  const kase = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
  if (!kase) return res.status(404).json({ error: 'Case not found' });
  const { status, priority, notes } = req.body || {};
  const allowedStatus = ['new', 'investigating', 'escalated', 'closed'];
  if (status && !allowedStatus.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE cases SET status = COALESCE(?, status), priority = COALESCE(?, priority), notes = COALESCE(?, notes) WHERE id = ?')
    .run(status ?? null, priority ?? null, notes ?? null, kase.id);
  broadcast('case', { caseId: kase.id });
  res.json(shapeCase(db.prepare(`${caseWithAlert} WHERE c.id = ?`).get(kase.id)));
});

router.post('/cases/:id/checklist', (req, res) => {
  const kase = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
  if (!kase) return res.status(404).json({ error: 'Case not found' });
  const state = jparse(kase.checklist_state, []);
  const i = Number(req.body?.index);
  if (!(i >= 0 && i < state.length)) return res.status(400).json({ error: 'Invalid checklist index' });
  state[i] = !state[i];
  db.prepare('UPDATE cases SET checklist_state = ? WHERE id = ?').run(JSON.stringify(state), kase.id);
  res.json({ checklistState: state });
});

router.post('/cases/:id/hint', (req, res) => {
  const row = db.prepare(`${caseWithAlert} WHERE c.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Case not found' });
  const sc = trainingFor(row.scenario_key);
  const hints = sc.hints || [];
  const used = row.hints_used || 0;
  if (used >= hints.length) return res.status(400).json({ error: 'No more hints available' });
  db.prepare('UPDATE cases SET hints_used = ? WHERE id = ?').run(used + 1, row.id);
  res.json({ hint: hints[used], hintsUsed: used + 1, remaining: hints.length - used - 1 });
});

router.post('/cases/:id/evidence', (req, res) => {
  const kase = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
  if (!kase) return res.status(404).json({ error: 'Case not found' });
  const evidence = jparse(kase.evidence, []);
  const { note, eventId } = req.body || {};
  if (!note && !eventId) return res.status(400).json({ error: 'Provide a note and/or eventId' });
  let eventSummary = null;
  if (eventId) {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (ev) eventSummary = `${new Date(ev.ts).toISOString()} ${ev.sourcetype}${ev.event_code ? ' EventCode=' + ev.event_code : ''} ${ev.message.slice(0, 120)}`;
  }
  evidence.push({ note: note || '', eventId: eventId || null, eventSummary, ts: Date.now() });
  db.prepare('UPDATE cases SET evidence = ? WHERE id = ?').run(JSON.stringify(evidence), kase.id);
  res.json({ evidence });
});

router.post('/cases/:id/complete', (req, res) => {
  const row = db.prepare(`${caseWithAlert} WHERE c.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Case not found' });
  if (row.status === 'closed') return res.status(400).json({ error: 'Case already closed' });
  const { disposition } = req.body || {};
  const allowed = ['true_positive', 'false_positive', 'benign', 'needs_escalation'];
  if (!allowed.includes(disposition)) return res.status(400).json({ error: 'Invalid disposition' });

  const sc = trainingFor(row.scenario_key);
  const score = computeScore(sc, row, disposition);
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(row.alert_id);
  const report = generateReport(sc, row, alert, score, disposition);
  db.prepare(`UPDATE cases SET status='closed', disposition=?, score=?, score_breakdown=?, report=?, closed_at=? WHERE id=?`)
    .run(disposition, score.total, JSON.stringify(score.breakdown), report, Date.now(), row.id);
  broadcast('case', { caseId: row.id });
  res.json({
    score: score.total,
    breakdown: score.breakdown,
    correctDisposition: sc.correctDisposition,
    explanation: sc.explanation || 'Case closed.',
    report,
  });
});

// ---------- Scenarios ----------
router.get('/scenarios', (req, res) => {
  res.json(getScenarios().map((s) => ({
    key: s.key, name: s.name, severity: s.severity, difficulty: s.difficulty || 'intermediate',
    objective: s.objective, mitre: s.mitre || [], detection: s.detection || '', eventCount: s.events.length,
  })));
});

router.post('/scenarios/:key/trigger', (req, res) => {
  try {
    res.json(triggerScenario(req.params.key));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// ---------- Detections ----------
router.get('/detections', (req, res) => {
  res.json(db.prepare('SELECT * FROM detections ORDER BY created_at DESC').all());
});

router.post('/detections', (req, res) => {
  const { name, query, severity } = req.body || {};
  if (!name || !query) return res.status(400).json({ error: 'name and query are required' });
  const info = db.prepare('INSERT INTO detections (name, query, severity, created_at) VALUES (?, ?, ?, ?)')
    .run(name, query, severity || 'medium', Date.now());
  res.json(db.prepare('SELECT * FROM detections WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/detections/:id', (req, res) => {
  const det = db.prepare('SELECT * FROM detections WHERE id = ?').get(req.params.id);
  if (!det) return res.status(404).json({ error: 'Not found' });
  const enabled = req.body?.enabled;
  db.prepare('UPDATE detections SET enabled = COALESCE(?, enabled) WHERE id = ?')
    .run(enabled === undefined ? null : enabled ? 1 : 0, det.id);
  res.json(db.prepare('SELECT * FROM detections WHERE id = ?').get(det.id));
});

router.delete('/detections/:id', (req, res) => {
  db.prepare('DELETE FROM detections WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Portfolio ----------
const RESUME_BULLETS = (stats) => [
  `Built a full-stack SOC analyst training platform (React/TypeScript, Node.js/Express, SQLite, Docker) simulating a SIEM with a custom SPL-style query language, live log generation, and real-time alerting over Server-Sent Events.`,
  `Investigated and dispositioned ${stats.completed} simulated security incidents spanning ${stats.techniques} MITRE ATT&CK techniques, including brute force, C2 beaconing, ransomware behavior, and data exfiltration patterns.`,
  `Authored ${stats.detections} custom detection rules using field-based query logic and validated them against live simulated telemetry, tuning out false positives.`,
  `Produced structured incident reports with executive summaries, ATT&CK mappings, evidence chains, and response recommendations for every closed investigation (avg. investigation score: ${stats.avgScore ?? 'N/A'}/100).`,
  `Designed a scenario-driven detection lab with 10+ attack simulations defined in declarative JSON, covering the full alert-to-report SOC workflow with SLA tracking and case management.`,
];

const TALKING_POINTS = [
  { q: 'Why did you build this?', a: 'I wanted hands-on reps with the full Tier 2 SOC workflow — triage, investigation, evidence collection, disposition, and reporting — without needing enterprise SIEM licenses. Building the platform itself also forced me to deeply understand how SIEMs work internally: ingestion, indexing, field extraction, search, and correlation.' },
  { q: 'Walk me through an investigation.', a: 'An alert fires — say, brute-force logons. I open the case, review the detection logic, and run the underlying query in the search console. I pivot on the source IP and the targeted account to establish scope, check whether the failed logons were followed by a success, attach the key events as evidence, write up my findings, and disposition it as a true positive with an escalation recommendation. The platform scores my investigation against an expected-evidence rubric.' },
  { q: 'How does the detection engine work?', a: 'Scenarios are declarative JSON: a set of templated log events plus detection logic, MITRE mappings, and training content. The engine injects those events into the event store on a schedule with randomized entities, then raises an alert. Separately, user-saved detections are evaluated every minute against new events — like a scheduled search in a real SIEM.' },
  { q: 'What would you improve?', a: 'Correlation rules across multiple event types (real SIEMs correlate, not just match), risk-based alerting that accumulates score per entity, and a proper query planner with aggregation commands like stats and timechart.' },
  { q: 'How do you avoid alert fatigue?', a: 'The platform taught me this firsthand — a noisy custom detection floods the queue. Threshold tuning, cooldown windows, and suppressing known-benign patterns matter as much as detection coverage.' },
];

router.get('/portfolio', (req, res) => {
  const completed = db.prepare(`${caseWithAlert} WHERE c.status = 'closed' ORDER BY c.closed_at DESC`).all().map(shapeCase);
  const detections = db.prepare('SELECT * FROM detections ORDER BY created_at DESC').all();
  const techniques = new Set();
  for (const c of completed) for (const m of c.mitre) techniques.add(m.technique);
  const avg = completed.filter((c) => c.score != null);
  const stats = {
    completed: completed.length,
    detections: detections.length,
    techniques: techniques.size,
    avgScore: avg.length ? Math.round(avg.reduce((s, c) => s + c.score, 0) / avg.length) : null,
  };
  res.json({ stats, completed, detections, resumeBullets: RESUME_BULLETS(stats), talkingPoints: TALKING_POINTS });
});

router.get('/portfolio/export.md', (req, res) => {
  const completed = db.prepare(`${caseWithAlert} WHERE c.status = 'closed' ORDER BY c.closed_at DESC`).all().map(shapeCase);
  const detections = db.prepare('SELECT * FROM detections ORDER BY created_at DESC').all();
  const techniques = new Set();
  for (const c of completed) for (const m of c.mitre) techniques.add(m.technique);
  const avg = completed.filter((c) => c.score != null);
  const stats = {
    completed: completed.length, detections: detections.length, techniques: techniques.size,
    avgScore: avg.length ? Math.round(avg.reduce((s, c) => s + c.score, 0) / avg.length) : null,
  };
  const md = [
    `# SOC Analyst Training Portfolio — SOCForge`,
    ``,
    `Generated ${new Date().toISOString()} · ${stats.completed} completed investigations · ${stats.techniques} ATT&CK techniques · avg score ${stats.avgScore ?? 'N/A'}/100`,
    ``,
    `> All activity in this portfolio was performed against **simulated log data** in a self-built training environment. No real systems were involved.`,
    ``,
    `## Resume Bullets`,
    ...RESUME_BULLETS(stats).map((b) => `- ${b}`),
    ``,
    `## Detection Rules Authored`,
    ...(detections.length ? detections.map((d) => `- **${d.name}** (${d.severity}): \`${d.query}\``) : ['_None yet._']),
    ``,
    `## Interview Talking Points`,
    ...TALKING_POINTS.flatMap((t) => [`### ${t.q}`, t.a, '']),
    `## Completed Incident Reports`,
    ``,
    ...completed.flatMap((c) => [c.report || `### Case #${c.id} — ${c.title} (no report generated)`, '', '---', '']),
  ].join('\n');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="socforge-portfolio.md"');
  res.send(md);
});
