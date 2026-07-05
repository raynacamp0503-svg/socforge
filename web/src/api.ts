import type {
  CaseDetail, Case, CompleteResult, DashboardData, Detection, PortfolioData, Scenario, SocEvent,
} from './types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

const post = (url: string, body?: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

export const api = {
  search: (q: string, earliest?: number, latest?: number) => {
    const p = new URLSearchParams({ q });
    if (earliest) p.set('earliest', String(earliest));
    if (latest) p.set('latest', String(latest));
    return fetch(`/api/search?${p}`).then((r) => j<{ count: number; events: SocEvent[] }>(r));
  },
  dashboard: () => fetch('/api/stats/dashboard').then((r) => j<DashboardData>(r)),
  cases: (status?: string) =>
    fetch(`/api/cases${status ? `?status=${status}` : ''}`).then((r) => j<Case[]>(r)),
  caseDetail: (id: number | string) => fetch(`/api/cases/${id}`).then((r) => j<CaseDetail>(r)),
  patchCase: (id: number, body: Partial<{ status: string; priority: string; notes: string }>) =>
    post(`/api/cases/${id}`, body, 'PATCH').then((r) => j<Case>(r)),
  toggleChecklist: (id: number, index: number) =>
    post(`/api/cases/${id}/checklist`, { index }).then((r) => j<{ checklistState: boolean[] }>(r)),
  getHint: (id: number) =>
    post(`/api/cases/${id}/hint`).then((r) => j<{ hint: string; hintsUsed: number; remaining: number }>(r)),
  addEvidence: (id: number, body: { note?: string; eventId?: number }) =>
    post(`/api/cases/${id}/evidence`, body).then((r) => j<{ evidence: Case['evidence'] }>(r)),
  completeCase: (id: number, disposition: string) =>
    post(`/api/cases/${id}/complete`, { disposition }).then((r) => j<CompleteResult>(r)),
  scenarios: () => fetch('/api/scenarios').then((r) => j<Scenario[]>(r)),
  triggerScenario: (key: string) =>
    post(`/api/scenarios/${key}/trigger`).then((r) => j<{ alertId: number; caseId: number }>(r)),
  detections: () => fetch('/api/detections').then((r) => j<Detection[]>(r)),
  saveDetection: (name: string, query: string, severity: string) =>
    post('/api/detections', { name, query, severity }).then((r) => j<Detection>(r)),
  toggleDetection: (id: number, enabled: boolean) =>
    post(`/api/detections/${id}`, { enabled }, 'PATCH').then((r) => j<Detection>(r)),
  deleteDetection: (id: number) =>
    post(`/api/detections/${id}`, undefined, 'DELETE').then((r) => j<{ ok: boolean }>(r)),
  portfolio: () => fetch('/api/portfolio').then((r) => j<PortfolioData>(r)),
};
