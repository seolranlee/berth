import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions } from './scanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8787;
const HOST = '127.0.0.1'; // 보안: 로컬호스트에만 바인딩 (외부 노출 금지)

// 정적 뷰어 (public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// 세션 목록 API
app.get('/api/sessions', async (req, res) => {
  try {
    res.json(await listSessions());
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n⚓ berth daemon → http://${HOST}:${PORT}\n`);
});
