export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SocEvent {
  id: number;
  ts: number;
  index_name: string;
  sourcetype: string;
  host: string | null;
  user: string | null;
  src_ip: string | null;
  dest_ip: string | null;
  event_code: string | null;
  process_name: string | null;
  severity: Severity;
  message: string;
  extra: Record<string, string>;
  scenario_key: string | null;
  alert_id: number | null;
}

export interface MitreMapping {
  tactic: string;
  technique: string;
  name: string;
}

export interface Case {
  id: number;
  alertId: number;
  title: string;
  severity: Severity;
  description: string;
  scenarioKey: string | null;
  detection: string;
  mitre: MitreMapping[];
  entities: Record<string, string>;
  status: 'new' | 'investigating' | 'escalated' | 'closed';
  priority: string;
  disposition: string | null;
  slaDue: number;
  notes: string;
  evidence: EvidenceItem[];
  checklistState: boolean[];
  hintsUsed: number;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  report: string | null;
  createdAt: number;
  closedAt: number | null;
}

export interface EvidenceItem {
  note: string;
  eventId: number | null;
  eventSummary: string | null;
  ts: number;
}

export interface ScoreBreakdown {
  checklist: { earned: number; max: number; detail: string };
  evidence: { earned: number; max: number; detail: string };
  disposition: { earned: number; max: number; detail: string };
  hintPenalty: { earned: number; detail: string };
}

export interface Training {
  scenarioName: string;
  difficulty: string;
  objective: string;
  checklist: string[];
  hintCount: number;
  expectedEvidence: string[];
  mitre: MitreMapping[];
  completed: boolean;
  explanation: string | null;
  correctDisposition: string | null;
}

export interface CaseDetail {
  case: Case;
  events: SocEvent[];
  training: Training;
}

export interface DashboardData {
  severityCounts: Record<string, number>;
  openCases: number;
  events24h: number;
  alerts24h: number;
  avgScore: number | null;
  timeline: { t: number; events: number; alerts: number }[];
  top: { src_ip: TopItem[]; user: TopItem[]; host: TopItem[] };
  mitre: (MitreMapping & { count: number })[];
  notables: Case[];
}

export interface TopItem {
  key: string;
  count: number;
}

export interface Scenario {
  key: string;
  name: string;
  severity: Severity;
  difficulty: string;
  objective: string;
  mitre: MitreMapping[];
  detection: string;
  eventCount: number;
}

export interface Detection {
  id: number;
  name: string;
  query: string;
  severity: string;
  enabled: number;
  last_fired: number | null;
  created_at: number;
}

export interface PortfolioData {
  stats: { completed: number; detections: number; techniques: number; avgScore: number | null };
  completed: Case[];
  detections: Detection[];
  resumeBullets: string[];
  talkingPoints: { q: string; a: string }[];
}

export interface CompleteResult {
  score: number;
  breakdown: ScoreBreakdown;
  correctDisposition: string | null;
  explanation: string;
  report: string;
}
