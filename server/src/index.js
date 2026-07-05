import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { sseHandler } from './sse.js';
import { loadScenarios } from './scenarios.js';
import { seedIfEmpty, startNoise } from './generator.js';
import { startEngine } from './engine.js';

const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'socforge-api' }));
app.get('/api/stream', sseHandler);
app.use('/api', router);

loadScenarios();
seedIfEmpty();
startNoise();
startEngine();

app.listen(PORT, () => {
  console.log(`SOCForge API listening on :${PORT} (simulated telemetry only — no real security data)`);
});
