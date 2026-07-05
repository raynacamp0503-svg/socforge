import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface Step {
  title: string;
  body: string;
  /** Route this step talks about. */
  route?: string;
  /** Returns true when the current path counts as "on the right page". */
  match?: (path: string) => boolean;
  /** Where the "Take me there" button goes (defaults to route). */
  goRoute?: string;
  goLabel?: string;
}

const onCase = (p: string) => p.startsWith('/cases/');

const STEPS: Step[] = [
  {
    title: 'Welcome to SOCForge 🎓',
    body: 'This app simulates a SIEM — the central tool of every Security Operations Center. A SIEM collects log events from across a network (logons, processes, DNS, firewall traffic) and raises ALERTS when something looks like an attack. Your job as an analyst: investigate each alert and decide if it is real. This coach will walk you through every screen. Your progress is saved — toggle the coach off and on anytime from the sidebar.',
  },
  {
    title: 'Dashboard: events vs. alerts',
    body: 'Look at the stat cards up top. EVENTS are raw log lines — thousands per day, almost all benign background noise. ALERTS are the handful of detections that matched suspicious patterns and need a human. The whole craft of SOC work is finding the few real attacks hiding inside the noise. OPEN CASES is your to-do list.',
    route: '/',
  },
  {
    title: 'Dashboard: volume & severity',
    body: 'The timeline chart shows event and alert volume over 24 hours. Analysts watch for SPIKES — a sudden burst of events on one host often marks an incident in progress. The severity donut tells you what to work first: critical and high alerts always jump the queue. Severity reflects potential impact, not certainty.',
    route: '/',
  },
  {
    title: 'Dashboard: top talkers',
    body: 'Top Source IPs, Users, and Hosts show who generates the most activity. These build your mental BASELINE of "normal". Anomalies stand out against it: an external IP dominating failed logons, a user account touching far more hosts than usual, a workstation suddenly chatty with the internet. When something looks off here, you pivot into Search to dig in.',
    route: '/',
  },
  {
    title: 'Dashboard: MITRE ATT&CK',
    body: 'MITRE ATT&CK is the industry-standard dictionary of attacker techniques, each with a T-number (e.g. T1110 = Brute Force). SOCs use it to describe what an attacker is doing, measure detection coverage, and communicate precisely. Every alert in SOCForge is mapped to its techniques — click any chip to read the official MITRE page. Knowing ATT&CK cold is a big interview advantage.',
    route: '/',
  },
  {
    title: 'Search: the query language',
    body: 'This is where investigations happen. Queries are field=value pairs: try clicking the example chip "index=windows EventCode=4625" and hit Search — that finds failed Windows logons. Combine terms (they AND together), use * as a wildcard (user=svc_*), or type bare words for free-text matching. The time picker limits how far back you look.',
    route: '/search',
  },
  {
    title: 'Search: reading raw events',
    body: 'Click any result row to expand the RAW EVENT — the full record with every parsed field. The table shows the important extracted fields (host, user, source IP, event code), but the raw view is the ground truth. Windows event codes worth memorizing: 4624 = successful logon, 4625 = failed logon, 4688 = process created, 4720 = account created, 7045 = service installed.',
    route: '/search',
  },
  {
    title: 'Search: pivoting',
    body: 'Notice that hosts, users, and IPs in results are LINKS. Clicking one searches for everything that entity did — that is called pivoting, and it is the core investigative move. Saw a suspicious logon? Pivot on the user to see what they did next. Found a bad IP? Pivot to see every host that talked to it. Real investigations are chains of pivots that build a timeline.',
    route: '/search',
  },
  {
    title: 'Search: save as detection',
    body: 'The "Save as detection" button turns your current query into a DETECTION RULE that automatically runs against live events every 60 seconds and raises its own alerts. This is detection engineering — the other half of SOC work. Try it later: save "index=windows EventCode=4625" and watch it fire. If it fires too often, you have created alert fatigue — tune or disable it on the Scenarios page.',
    route: '/search',
  },
  {
    title: 'Alert Queue: triage',
    body: 'This is your case queue. TRIAGE means deciding what to work first: severity, then SLA. The SLA timer counts down how long you have to respond (critical = 30 min, high = 1 h). Statuses follow a lifecycle: New → Investigating → Escalated or Closed. Click "Start" to claim a case, then "Open" to investigate. New live alerts arrive every few minutes — watch for the toast in the corner.',
    route: '/queue',
  },
  {
    title: 'Case: the investigation workspace',
    body: 'Open any case from the queue (click "Open") and this coach will continue there. The left side holds the FACTS: alert description, the detection logic that fired (click "Run in Search ↗" to see the underlying events), and all related logs. The right side is your TRAINING PANEL: objective, checklist, hints, and the close-case controls.',
    match: onCase,
    goRoute: '/queue',
    goLabel: 'Go to the queue',
  },
  {
    title: 'Case: objective & checklist',
    body: 'The Investigation Objective states the question you must answer. The Analyst Checklist is your runbook — real SOCs use them so nothing gets missed under pressure. Work it top to bottom, ticking items as you complete them (worth 40 of 100 points). Each item usually means running a search: use the detection logic and pivots on the entities involved.',
    match: onCase,
    goRoute: '/queue',
    goLabel: 'Go to the queue',
  },
  {
    title: 'Case: evidence',
    body: 'Every claim in an incident report needs EVIDENCE. In Related Logs, click "+ Evidence" on the events that prove your conclusion — the burst of failed logons, the malicious process creation, the suspicious DNS query. You can also add written observations in the Notes & Evidence tab. Evidence is worth 20 points, and the rubric there shows what a perfect case file contains.',
    match: onCase,
    goRoute: '/queue',
    goLabel: 'Go to the queue',
  },
  {
    title: 'Case: hints',
    body: 'Stuck? Reveal a hint — each costs 10 points, and that is fine. A slightly lower score with the RIGHT conclusion beats a perfect score of confusion. Hints are written like a senior analyst looking over your shoulder: the first nudges where to look, the last practically gives the answer. Use them to learn the pattern; next time you will not need them.',
    match: onCase,
    goRoute: '/queue',
    goLabel: 'Go to the queue',
  },
  {
    title: 'Case: the four dispositions',
    body: 'Closing a case means committing to a DISPOSITION (40 points if correct). TRUE POSITIVE: a real attack — the alert was right. FALSE POSITIVE: the detection fired on harmless activity — needs tuning. BENIGN: the activity really happened but was authorized (a sanctioned scan, an admin doing their job). NEEDS ESCALATION: real and too big for one analyst — ransomware, insider data theft, anything requiring the incident-response team.',
    match: onCase,
    goRoute: '/queue',
    goLabel: 'Go to the queue',
  },
  {
    title: 'Case: report & feedback',
    body: 'After you Submit & Score, the Report tab unlocks: your score breakdown, a generated incident report (built from your notes and evidence), and — most importantly — the EXPLANATION of what was really happening and how an experienced analyst reasons about it. Read it every time, especially when you got it wrong. That feedback loop is the entire point of this simulator.',
    match: onCase,
    goRoute: '/queue',
    goLabel: 'Go to the queue',
  },
  {
    title: 'Scenarios: practice on demand',
    body: 'No need to wait for the live engine — trigger any scenario instantly with "▶ Trigger now". Start with Brute-Force Login (beginner) and work up to Ransomware and Data Exfiltration (advanced). This page also lists your saved detections, and the Scenario Builder template lets you author brand-new attacks as JSON files — a great way to learn how detections map to log evidence.',
    route: '/scenarios',
  },
  {
    title: 'Portfolio: your proof of work',
    body: 'Everything you do here accumulates into interview material: completed investigations with scores, ATT&CK coverage, detection rules you authored, auto-generated resume bullets, and prepared answers to common interview questions. The "Export portfolio" button produces a single Markdown file containing all your incident reports — perfect for a GitHub repo or to walk through in an interview.',
    route: '/portfolio',
  },
  {
    title: 'Your first mission 🚀',
    body: 'You are ready. Suggested first exercise: go to Scenarios → trigger "Brute-Force Login" → open the case → work the checklist using Search (start with the detection query, then pivot on the account and source IP) → attach the failed-logon burst and the successful logon as evidence → write a short note → close as True Positive. Aim for 90+. Click Finish to turn the coach off — it is always in the sidebar when you need it.',
    route: '/scenarios',
  },
];

interface CoachState {
  enabled: boolean;
  step: number;
}

interface CoachCtx extends CoachState {
  toggle: () => void;
  next: () => void;
  back: () => void;
  finish: () => void;
}

const Ctx = createContext<CoachCtx>({ enabled: false, step: 0, toggle: () => {}, next: () => {}, back: () => {}, finish: () => {} });
export const useCoach = () => useContext(Ctx);

const KEY = 'socforge-coach';

function load(): CoachState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { enabled: !!s.enabled, step: Math.min(Math.max(0, s.step | 0), STEPS.length - 1) };
    }
  } catch { /* fresh start */ }
  return { enabled: true, step: 0 }; // coach on by default for first-time users
}

export function CoachProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CoachState>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const ctx: CoachCtx = {
    ...state,
    toggle: () => setState((s) => ({ ...s, enabled: !s.enabled })),
    next: () => setState((s) => ({ ...s, step: Math.min(s.step + 1, STEPS.length - 1) })),
    back: () => setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) })),
    finish: () => setState({ enabled: false, step: 0 }),
  };

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function CoachPanel() {
  const { enabled, step, toggle, next, back, finish } = useCoach();
  const loc = useLocation();
  const nav = useNavigate();

  if (!enabled) return null;
  const s = STEPS[step];
  const onRightPage = s.match ? s.match(loc.pathname) : s.route ? loc.pathname === s.route : true;
  const last = step === STEPS.length - 1;

  return (
    <div className="coach">
      <div className="coach-header">
        <span>🎓 Training Coach</span>
        <span className="coach-progress">step {step + 1} / {STEPS.length}</span>
        <button className="coach-close" onClick={toggle} title="Hide coach (progress is saved)">×</button>
      </div>
      <div className="coach-bar-track"><div className="coach-bar" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <div className="coach-title">{s.title}</div>
      <div className="coach-body">{s.body}</div>
      {!onRightPage && (
        <button className="coach-go" onClick={() => nav(s.goRoute || s.route || '/')}>
          → {s.goLabel || 'Take me to that page'}
        </button>
      )}
      <div className="coach-actions">
        <button className="small" onClick={back} disabled={step === 0}>← Back</button>
        <span className="spacer" />
        {last ? (
          <button className="small primary" onClick={finish}>Finish ✓</button>
        ) : (
          <button className="small primary" onClick={next}>Next →</button>
        )}
      </div>
    </div>
  );
}
