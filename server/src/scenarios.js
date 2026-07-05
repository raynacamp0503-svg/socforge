import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO_DIR = process.env.SCENARIO_DIR || path.join(__dirname, '..', 'scenarios');

let scenarios = [];

export function loadScenarios() {
  scenarios = [];
  if (!fs.existsSync(SCENARIO_DIR)) return scenarios;
  for (const file of fs.readdirSync(SCENARIO_DIR).filter((f) => f.endsWith('.json'))) {
    try {
      const sc = JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, file), 'utf8'));
      const missing = ['key', 'name', 'title', 'severity', 'events', 'checklist', 'objective'].filter((k) => !sc[k]);
      if (missing.length) {
        console.warn(`[scenarios] Skipping ${file}: missing fields ${missing.join(', ')}`);
        continue;
      }
      scenarios.push(sc);
    } catch (e) {
      console.warn(`[scenarios] Failed to parse ${file}: ${e.message}`);
    }
  }
  console.log(`[scenarios] Loaded ${scenarios.length} scenarios from ${SCENARIO_DIR}`);
  return scenarios;
}

export const getScenarios = () => scenarios;
export const getScenario = (key) => scenarios.find((s) => s.key === key);

// Fallback training content for alerts fired by user-saved detections.
export const GENERIC_SCENARIO = {
  key: null,
  name: 'Custom Detection Match',
  difficulty: 'intermediate',
  objective:
    'One of your saved detections matched recent events. Determine whether the matching activity is malicious, suspicious, or expected, and disposition the case accordingly.',
  checklist: [
    'Re-run the saved detection query in the search console and review the matching events',
    'Identify the users, hosts, and IP addresses involved',
    'Pivot on each entity to review surrounding activity (±15 minutes)',
    'Check whether the activity matches a known-benign pattern (maintenance, service accounts, scanners)',
    'Decide on a disposition and document your reasoning in the notes',
  ],
  hints: [
    'Start by running the detection query shown in the alert description in the Search console.',
    'Pivot searches like user=<name> or src_ip=<ip> reveal what else the entity was doing.',
    'If the matched events are routine noise, tune the detection query and close as false positive.',
  ],
  expectedEvidence: ['Matching events from the detection query', 'Pivot search results for involved entities'],
  correctDisposition: null,
  mitre: [],
  explanation:
    'Custom detections require tuning. A good analyst validates matches against context: who, what host, what time, and whether the pattern is expected in this environment. Either outcome (true or false positive) is valid if your evidence supports it.',
};
