import { db, withTransaction } from './db.js';
import { writeEvent, triggerScenario, trainingFor, computeScore, generateReport } from './engine.js';
import { getScenarios } from './scenarios.js';
import { pick, rint, intIp, USERS, SVC_ACCOUNTS, HOSTS, DOMAINS_BENIGN, EXT_IPS } from './util.js';

const PROCS = ['chrome.exe', 'outlook.exe', 'teams.exe', 'explorer.exe', 'svchost.exe', 'winword.exe', 'excel.exe', 'code.exe'];

function noiseEvent(ts) {
  const user = pick([...USERS, ...SVC_ACCOUNTS]);
  const host = pick(HOSTS);
  const roll = Math.random();
  if (roll < 0.25) {
    return { ts, index: 'windows', sourcetype: 'wineventlog', event_code: '4624', host, user, src_ip: intIp(),
      message: `An account was successfully logged on. Account Name: ${user} Logon Type: ${pick([2, 3, 10])} Workstation: ${host}` };
  }
  if (roll < 0.45) {
    const proc = pick(PROCS);
    return { ts, index: 'sysmon', sourcetype: 'sysmon', event_code: '1', host, user, process_name: proc,
      message: `Process Create: Image: C:\\Program Files\\${proc} User: CORP\\${user} ParentImage: C:\\Windows\\explorer.exe` };
  }
  if (roll < 0.65) {
    const domain = pick(DOMAINS_BENIGN);
    return { ts, index: 'sysmon', sourcetype: 'sysmon', event_code: '22', host, user, process_name: pick(PROCS),
      message: `Dns query: QueryName: ${domain} QueryStatus: 0 QueryResults: ${rint(13, 104)}.${rint(1, 254)}.${rint(1, 254)}.${rint(1, 254)}`,
      extra: { query: domain } };
  }
  if (roll < 0.85) {
    const src = intIp();
    return { ts, index: 'network', sourcetype: 'firewall', host: 'FW-EDGE01', src_ip: src, dest_ip: pick([intIp(), pick(EXT_IPS)]),
      message: `action=allowed proto=tcp src=${src} dport=${pick([443, 80, 53, 445, 389])} bytes_out=${rint(400, 90000)}`,
      extra: { action: 'allowed' } };
  }
  const site = pick(DOMAINS_BENIGN);
  return { ts, index: 'proxy', sourcetype: 'web_proxy', host: 'PROXY01', user, src_ip: intIp(),
    message: `GET https://${site}/ status=200 category=business bytes=${rint(1000, 60000)}`, extra: { url: site, status: '200' } };
}

export function startNoise() {
  setInterval(() => {
    const n = rint(1, 3);
    for (let i = 0; i < n; i++) writeEvent(noiseEvent(Date.now() - rint(0, 3000)));
  }, 4000).unref();
}

export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  if (count > 0) return;
  console.log('[seed] Empty database — backfilling 24h of noise + seed incidents...');

  const now = Date.now();
  withTransaction(() => {
    for (let i = 0; i < 2200; i++) {
      writeEvent(noiseEvent(now - rint(0, 24 * 3600 * 1000)));
    }
  });

  const scs = getScenarios();
  if (!scs.length) return;

  // Three historical incidents in the backlog + one completed example case.
  const picks = [...scs].sort(() => Math.random() - 0.5).slice(0, 4);
  const offsets = [20 * 3600 * 1000, 9 * 3600 * 1000, 3 * 3600 * 1000, 45 * 60 * 1000];
  const created = picks.map((sc, i) => ({ sc, ...triggerScenario(sc.key, { at: now - offsets[i] }) }));

  // Auto-complete the oldest one as a portfolio example.
  const ex = created[0];
  const sc = trainingFor(ex.sc.key);
  const kase = db.prepare('SELECT * FROM cases WHERE id = ?').get(ex.caseId);
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(ex.alertId);
  const checklist = new Array(sc.checklist.length).fill(true);
  const evidence = (sc.expectedEvidence || []).slice(0, 2).map((e) => ({ note: e, ts: kase.created_at + 10 * 60 * 1000 }));
  const notes = 'Seed example case auto-completed by SOCForge to demonstrate the workflow. Reviewed related events, confirmed the detection logic matched real activity in the simulated logs, and closed with the correct disposition.';
  const patched = { ...kase, checklist_state: JSON.stringify(checklist), evidence: JSON.stringify(evidence), notes, hints_used: 0 };
  const disposition = sc.correctDisposition || 'true_positive';
  const score = computeScore(sc, patched, disposition);
  const report = generateReport(sc, patched, alert, score, disposition);
  db.prepare(
    `UPDATE cases SET status='closed', disposition=?, checklist_state=?, evidence=?, notes=?, score=?, score_breakdown=?, report=?, closed_at=? WHERE id=?`
  ).run(disposition, patched.checklist_state, patched.evidence, notes, score.total, JSON.stringify(score.breakdown), report, kase.created_at + 42 * 60 * 1000, kase.id);

  console.log(`[seed] Seeded ${created.length} incidents (case #${ex.caseId} pre-completed as an example).`);
}
