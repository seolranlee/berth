import { warpAdapter } from './warp.js';

// 터미널 어댑터 레지스트리.
// 새 터미널 지원 추가 = 여기에 어댑터 한 줄 등록 (iterm, terminal-app, cli...).
const ADAPTERS = {
  [warpAdapter.id]: warpAdapter,
};

export function getAdapter(name) {
  return ADAPTERS[name] || null;
}

export function listAdapters() {
  return Object.values(ADAPTERS).map((a) => ({ id: a.id, name: a.name }));
}
