import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 한글 제목 캐시. 생성 비용이 있어(LLM 호출) 한 번 만들면 재사용.
const STATE_DIR = path.join(os.homedir(), '.berth');
const FILE = path.join(STATE_DIR, 'titles.json');

interface Entry {
  title: string;
  basedOn: string; // 생성 시점의 session.updatedAt — 세션이 갱신되면 재생성
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

// updatedAt이 일치할 때만 캐시 적중 (stale 시 null → 재생성 대상)
export function getTitle(sessionId: string, updatedAt: string): string | null {
  const e = read()[sessionId];
  return e && e.basedOn === updatedAt ? e.title : null;
}

export function setTitle(sessionId: string, title: string, updatedAt: string): void {
  const store = read();
  store[sessionId] = { title, basedOn: updatedAt };
  write(store);
}
