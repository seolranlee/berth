import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 한글 제목 캐시. 생성 비용(LLM 호출)이 있어 세션당 "한 번만" 만들고 영구 재사용.
// updatedAt이 바뀌어도 자동 재생성하지 않음 → 토큰 절약 (정상 상태 0회 호출).
const STATE_DIR = path.join(os.homedir(), '.berth');
const FILE = path.join(STATE_DIR, 'titles.json');

interface Entry {
  title: string;
  basedOn: string; // 생성 시점의 session.updatedAt (참고용 — 향후 stale 표시/수동 재생성에 활용)
}
type Store = Record<string, Entry>;

function read(): Store {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data && typeof data === 'object' ? (data as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf8');
}

// 캐시된 제목이 있으면 반환 (한 번 생성하면 영구 유지 — 재생성 안 함)
export function getTitle(sessionId: string): string | null {
  return read()[sessionId]?.title ?? null;
}

export function setTitle(sessionId: string, title: string, basedOn: string): void {
  const store = read();
  store[sessionId] = { title, basedOn };
  write(store);
}
