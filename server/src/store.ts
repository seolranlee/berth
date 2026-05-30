import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 사용자 메타데이터(즐겨찾기 등) 영속화 위치. 세션 파일과 분리.
const STATE_DIR = path.join(os.homedir(), '.berth');
const STATE_FILE = path.join(STATE_DIR, 'favorites.json');

interface State {
  pinned: string[];
}

function read(): State {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const pinned = (data as { pinned?: unknown }).pinned;
    return { pinned: Array.isArray(pinned) ? pinned.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return { pinned: [] }; // 파일 없음/깨짐 → 빈 상태
  }
}

function write(state: State): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function getPinned(): string[] {
  return read().pinned;
}

export function setPinned(sessionId: string, pinned: boolean): string[] {
  const set = new Set(read().pinned);
  if (pinned) set.add(sessionId);
  else set.delete(sessionId);
  const next = [...set];
  write({ pinned: next });
  return next;
}
