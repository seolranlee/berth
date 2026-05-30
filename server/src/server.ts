import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions, isValidSessionId } from './scanner';
import { launchSession } from './launcher';
import { listAdapters } from './adapters/index';
import { getPinned, setPinned } from './store';
import { generateKoreanTitle } from './title-generator';
import { getTitle, setTitle } from './title-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 8787;
const HOST = '127.0.0.1'; // 보안: 로컬호스트에만 바인딩 (외부 노출 금지)

// 최근 N분 내 활동한 세션 = 진행중 (파일이 쓰이는 중 = 가장 확실한 신호)
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const isActive = (updatedAt: string) =>
  Date.now() - new Date(updatedAt).getTime() < ACTIVE_WINDOW_MS;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

app.use(express.json());

// 정적: 빌드된 React 앱 (web/dist). 개발 시엔 Vite(5173)가 서빙하고 /api만 프록시.
app.use(express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

// 세션 목록 (즐겨찾기 + 한글 제목 + 진행중 주입, 핀 우선 정렬)
app.get('/api/sessions', async (_req: Request, res: Response) => {
  try {
    const pinned = new Set(getPinned());
    const sessions = (await listSessions()).map((s) => {
      const active = isActive(s.updatedAt);
      return {
        ...s,
        pinned: pinned.has(s.sessionId),
        active,
        // 진행중 세션은 내용이 미완 → 한글 제목 표시 보류 (영어 + 배지로 표시)
        koreanTitle: active ? null : getTitle(s.sessionId, s.updatedAt),
      };
    });
    // 핀 먼저 (안정 정렬이라 그룹 내 최근순 유지)
    sessions.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    res.json(sessions);
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

// 즐겨찾기 추가/해제 (서버 영속화: ~/.berth/favorites.json)
app.post('/api/sessions/:id/pin', (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) {
    res.status(400).json({ error: '잘못된 세션 id' });
    return;
  }
  res.json({ pinned: setPinned(req.params.id, true) });
});

app.delete('/api/sessions/:id/pin', (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) {
    res.status(400).json({ error: '잘못된 세션 id' });
    return;
  }
  res.json({ pinned: setPinned(req.params.id, false) });
});

// --- 한글 제목 백그라운드 생성 ---
let titleGenRunning = false;

async function generateMissingTitles(): Promise<void> {
  if (titleGenRunning) return;
  titleGenRunning = true;
  try {
    const sessions = await listSessions();
    // 진행중(active) 세션은 제외 — 내용 미완이라 제목이 흔들림. idle 세션만 생성.
    const pending = sessions.filter(
      (s) => !isActive(s.updatedAt) && !getTitle(s.sessionId, s.updatedAt),
    );
    const CONCURRENCY = 4;
    let i = 0;
    const worker = async () => {
      while (i < pending.length) {
        const s = pending[i++];
        try {
          const title = await generateKoreanTitle(s);
          setTitle(s.sessionId, title, s.updatedAt);
        } catch {
          // 실패 세션은 스킵 (다음 트리거 때 재시도)
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    titleGenRunning = false;
  }
}

// 누락/stale 한글 제목 생성 트리거 (즉시 반환, 생성은 백그라운드, 진행중 제외)
app.post('/api/titles/generate', async (_req: Request, res: Response) => {
  try {
    const sessions = await listSessions();
    const pending = sessions.filter(
      (s) => !isActive(s.updatedAt) && !getTitle(s.sessionId, s.updatedAt),
    ).length;
    void generateMissingTitles(); // fire-and-forget
    res.json({ generating: true, pending });
  } catch (e) {
    res.status(500).json({ error: errMsg(e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n⚓ berth daemon → http://${HOST}:${PORT}\n`);
});
