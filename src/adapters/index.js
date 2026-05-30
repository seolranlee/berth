import { warpAdapter } from './warp.js';
import { itermAdapter } from './iterm.js';
import { terminalAppAdapter } from './terminal-app.js';

// 터미널 어댑터 레지스트리.
// 새 터미널 지원 추가 = 여기에 어댑터 한 줄 등록.
const ADAPTERS = {
  [warpAdapter.id]: warpAdapter,
  [itermAdapter.id]: itermAdapter,
  [terminalAppAdapter.id]: terminalAppAdapter,
};

export function getAdapter(name) {
  return ADAPTERS[name] || null;
}

// 설치 여부(available)까지 포함해 비동기로 나열
export async function listAdapters() {
  return Promise.all(
    Object.values(ADAPTERS).map(async (a) => ({
      id: a.id,
      name: a.name,
      available: a.isAvailable ? await a.isAvailable().catch(() => false) : true,
    })),
  );
}
