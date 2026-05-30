import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions } from './scanner';
import { launchSession } from './launcher';
import { listAdapters } from './adapters/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8787;
const HOST = '127.0.0.1'; // 보안: 로컬호스트에만 바인딩 (외부 노출 금지)

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

app.use(express.json());

// 정적: 빌드된 React 앱 (web/dist). 개발 시엔 Vite(5173)가 서빙하고 /api만 프록시.
app.use(express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

// 세션 목록
app.get('/api/sessions', async (_req: Request, res: Response) => {
  try {
    res.json(await listSessions());
  } catch (e) {
    res.status(500).json({ error: errMsg(e) });
  }
});

// 지원 터미널 목록 (설치 여부 포함)
app.get('/api/terminals', async (_req: Request, res: Response) => {
  try {
    res.json(await listAdapters());
  } catch (e) {
    res.status(500).json({ error: errMsg(e) });
  }
});

// 세션 실행 (선택한 터미널에서 claude --resume)
app.post('/api/sessions/:id/launch', async (req: Request, res: Response) => {
  try {
    const terminal = (req.body?.terminal as string) || 'warp';
    res.json(await launchSession(req.params.id, terminal));
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n⚓ berth daemon → http://${HOST}:${PORT}\n`);
});
