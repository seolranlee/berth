import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions } from './scanner.js';
import { launchSession } from './launcher.js';
import { listAdapters } from './adapters/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8787;
const HOST = '127.0.0.1'; // 보안: 로컬호스트에만 바인딩 (외부 노출 금지)

app.use(express.json());

// 정적 뷰어 (public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// 세션 목록
app.get('/api/sessions', async (req, res) => {
  try {
    res.json(await listSessions());
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// 지원 터미널 목록
app.get('/api/terminals', (req, res) => {
  res.json(listAdapters());
});

// 세션 실행 (선택한 터미널에서 claude --resume)
app.post('/api/sessions/:id/launch', async (req, res) => {
  try {
    const terminal = (req.body && req.body.terminal) || 'warp';
    const result = await launchSession(req.params.id, terminal);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n⚓ berth daemon → http://${HOST}:${PORT}\n`);
});
