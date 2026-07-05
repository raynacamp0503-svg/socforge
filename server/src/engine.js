import { db, jparse, withTransaction } from './db.js';
import { broadcast } from './sse.js';
import { getScenarios, getScenario, GENERIC_SCENARIO } from './scenarios.js';
import { buildContext, tpl, pick, rint } from './util.js';
import { runSearch } from './search.js';

const SLA_MINUTES = { critical: 30, high: 60, medium: 240, low: 480 };

// Live alert generation can be paused from the UI without stopping the server.
let paused = false;
export const isPaused = () => paused;
export const setPaused = (v) => { paused = !!v; };

const insertEvent = db.prepare(`
  INSERT INTO events (ts, index_name, sourcetype, host, "user", src_ip, dest_ip, event_code, process_name, severity, message, extra, scenario_key, alert_id)
  VALUES (@ts, @index_name, @sourcetype, @host, @user, @src_ip, @dest_ip, @event_code, @process_name, @severity, @message, @extra, @scenario_key, @alert_id)
`);

export function writeEvent(e) {
  insertEvent.run({
    ts: e.ts ?? Date.now(),
    index_name: e.index || e.index_name || 'main',
    sourcetype: e.sourcetype || 'generic',
    host: e.host ?? null,
    user: e.user ?? null,
    src_ip: e.src_ip ?? null,
    dest_ip: e.dest_ip ?? null,
    event_code: e.event_code != null ? String(e.event_code) : null,
    process_name: e.process_name ?? null,
    severity: e.severity || 'info',
    message: e.message || '',
    extra: JSON.stringify(e.extra || {}),
    scenario_key: e.scenario_key ?? null,
    alert_id: e.alert_id ?? null,
  });
}

export function triggerScenario(key, { at } = {}) {
  const sc = getScenario(key);
  if (!sc) throw new Error(`Unknown scenario: ${key}`);
  const ctx = buildContext();
  const now = at || Date.now();

  const alertInfo = db
    .prepare(
      `INSERT INTO alerts (created_at, title, description, severity, scenario_key, detection, mitre, entities)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      now,
      tpl(sc.title, ctx),
      tpl(sc.description || sc.objective, ctx),
      sc.severity,
      sc.key,
      tpl(sc.detection || '', ctx),
      JSON.stringify(sc.mitre || []),
      JSON.stringify(ctx)
    );
  const alertId = alertInfo.lastInsertRowid;

  withTransaction(() => {
    for (const spec of sc.events) {
      const repeat = spec.repeat || 1;
      for (let i = 0; i < repeat; i++) {
        const ts = now + (spec.offsetSec || 0) * 1000 + i * (spec.intervalSec || 1) * 1000;
        writeEvent({
          ts,
          index: tpl(spec.index || 'main', ctx),
          sourcetype: tpl(spec.sourcetype || 'generic', ctx),
          host: tpl(spec.host, ctx),
          user: tpl(spec.user, ctx),
          src_ip: tpl(spec.src_ip, ctx),
          dest_ip: tpl(spec.dest_ip, ctx),
          event_code: spec.event_code,
          process_name: tpl(spec.process_name, ctx),
          severity: spec.severity || 'info',
          message: tpl(spec.message || '', ctx),
          extra: Object.fromEntries(Object.entries(spec.extra || {}).map(([k, v]) => [k, tpl(v, ctx)])),
          scenario_key: sc.key,
          alert_id: alertId,
        });
      }
    }
  });

  const slaMin = SLA_MINUTES[sc.severity] || 240;
  const caseInfo = db
    .prepare(
      `INSERT INTO cases (alert_id, status, priority, sla_due, checklist_state, created_at)
       VALUES (?, 'new', ?, ?, ?, ?)`
    )
    .run(
      alertId,
      sc.severity === 'critical' || sc.severity === 'high' ? 'high' : sc.severity,
      now + slaMin * 60 * 1000,
      JSON.stringify(new Array(sc.checklist.length).fill(false)),
      now
    );
  const caseId = caseInfo.lastInsertRowid;

  broadcast('alert', {
    caseId,
    alertId,
    title: tpl(sc.title, ctx),
    severity: sc.severity,
    scenario: sc.name,
  });
  return { alertId, caseId };
}

export function trainingFor(scenarioKey) {
  return getScenario(scenarioKey) || GENERIC_SCENARIO;
}

export function computeScore(sc, kase, disposition) {
  const checklist = jparse(kase.checklist_state, []);
  const total = Math.max(sc.checklist.length, 1);
  const done = checklist.filter(Boolean).length;
  const evidence = jparse(kase.evidence, []);
  const expected = Math.max((sc.expectedEvidence || []).length, 1);

  const checklistPts = Math.round(40 * (done / total));
  const evidencePts = Math.round(20 * Math.min(evidence.length / expected, 1));
  const dispositionPts = sc.correctDisposition == null ? 40 : disposition === sc.correctDisposition ? 40 : 0;
  const hintPenalty = 10 * (kase.hints_used || 0);
  const total_ = Math.max(0, Math.min(100, checklistPts + evidencePts + dispositionPts - hintPenalty));

  return {
    total: total_,
    breakdown: {
      checklist: { earned: checklistPts, max: 40, detail: `${done}/${total} checklist items completed` },
      evidence: { earned: evidencePts, max: 20, detail: `${evidence.length} evidence item(s) attached` },
      disposition: {
        earned: dispositionPts,
        max: 40,
        detail:
          sc.correctDisposition == null
            ? 'Custom detection — any well-reasoned disposition accepted'
            : disposition === sc.correctDisposition
              ? 'Correct disposition'
              : `Incorrect — expected "${sc.correctDisposition.replace('_', ' ')}"`,
      },
      hintPenalty: { earned: -hintPenalty, detail: `${kase.hints_used || 0} hint(s) used (-10 each)` },
    },
  };
}

export function generateReport(sc, kase, alert, score, disposition) {
  const entities = jparse(alert.entities, {});
  const mitre = jparse(alert.mitre, []);
  const evidence = jparse(kase.evidence, []);
  const d = new Date(kase.created_at);
  const lines = [
    `# Incident Report — ${alert.title}`,
    ``,
    `**Case:** #${kase.id}  |  **Severity:** ${alert.severity.toUpperCase()}  |  **Opened:** ${d.toISOString()}  |  **Disposition:** ${(disposition || 'undetermined').replace('_', ' ')}`,
    ``,
    `## Executive Summary`,
    sc.explanation || alert.description,
    ``,
    `## Affected Entities`,
    ...['user', 'host', 'src_ip', 'attacker_ip', 'c2_ip'].filter((k) => entities[k]).map((k) => `- **${k}**: ${entities[k]}`),
    ``,
    `## MITRE ATT&CK Mapping`,
    ...(mitre.length ? mitre.map((m) => `- ${m.technique} — ${m.name} (${m.tactic})`) : ['- N/A']),
    ``,
    `## Evidence Collected`,
    ...(evidence.length ? evidence.map((ev, i) => `${i + 1}. ${ev.note || ''}${ev.eventSummary ? ` — \`${ev.eventSummary}\`` : ''}`) : ['- No evidence attached']),
    ``,
    `## Analyst Notes`,
    kase.notes || '_None recorded._',
    ``,
    `## Detection Logic`,
    '```',
    alert.detection || 'N/A',
    '```',
    ``,
    `## Investigation Score`,
    `${score.total}/100 — checklist ${score.breakdown.checklist.earned}/40, evidence ${score.breakdown.evidence.earned}/20, disposition ${score.breakdown.disposition.earned}/40, hint penalty ${score.breakdown.hintPenalty.earned}`,
  ];
  if (sc.reportTemplate) {
    lines.push('', '## Recommended Response Actions', tpl(sc.reportTemplate, { ...entities, notes: kase.notes || '', disposition: disposition || '', score: String(score.total) }));
  }
  return lines.join('\n');
}

// ---- Live alert scheduler ----
export function startEngine() {
  const minS = Number(process.env.ALERT_MIN_SEC || 120);
  const maxS = Number(process.env.ALERT_MAX_SEC || 300);

  const fire = () => {
    const scs = getScenarios();
    if (scs.length && !paused) {
      try {
        const { caseId } = triggerScenario(pick(scs).key);
        console.log(`[engine] Fired live scenario -> case #${caseId}`);
      } catch (e) {
        console.error('[engine] trigger failed:', e.message);
      }
    }
    setTimeout(fire, rint(minS, maxS) * 1000);
  };
  setTimeout(fire, 25 * 1000); // first live alert shortly after startup

  // Saved-detection runner: evaluate enabled detections every 60s with a 10-min cooldown.
  setInterval(() => {
    if (paused) return;
    const now = Date.now();
    for (const det of db.prepare('SELECT * FROM detections WHERE enabled = 1').all()) {
      if (det.last_fired && now - det.last_fired < 10 * 60 * 1000) continue;
      let hits = [];
      try {
        hits = runSearch(det.query, { earliest: now - 75 * 1000, limit: 50 });
      } catch { continue; }
      if (!hits.length) continue;
      db.prepare('UPDATE detections SET last_fired = ? WHERE id = ?').run(now, det.id);
      const alertInfo = db
        .prepare(
          `INSERT INTO alerts (created_at, title, description, severity, scenario_key, detection, mitre, entities)
           VALUES (?, ?, ?, ?, NULL, ?, '[]', '{}')`
        )
        .run(now, `Custom detection: ${det.name}`, `Saved detection "${det.name}" matched ${hits.length} event(s) in the last minute. Query: ${det.query}`, det.severity || 'medium', det.query);
      const alertId = alertInfo.lastInsertRowid;
      db.prepare('UPDATE events SET alert_id = ? WHERE id IN (' + hits.map(() => '?').join(',') + ')').run(alertId, ...hits.map((h) => h.id));
      const slaMin = SLA_MINUTES[det.severity] || 240;
      const caseInfo = db
        .prepare(`INSERT INTO cases (alert_id, status, priority, sla_due, checklist_state, created_at) VALUES (?, 'new', ?, ?, ?, ?)`)
        .run(alertId, det.severity || 'medium', now + slaMin * 60 * 1000, JSON.stringify(new Array(GENERIC_SCENARIO.checklist.length).fill(false)), now);
      broadcast('alert', { caseId: caseInfo.lastInsertRowid, alertId, title: `Custom detection: ${det.name}`, severity: det.severity || 'medium', scenario: 'Custom detection' });
      console.log(`[engine] Custom detection "${det.name}" fired`);
    }
  }, 60 * 1000).unref();

  // Retention: keep the events table bounded.
  setInterval(() => {
    db.prepare('DELETE FROM events WHERE alert_id IS NULL AND ts < ?').run(Date.now() - 7 * 24 * 3600 * 1000);
  }, 30 * 60 * 1000).unref();
}
