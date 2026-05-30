import type { TerminalInfo } from '@shared';
import type { TerminalAdapter } from './types';
import { warpAdapter } from './warp';
import { itermAdapter } from './iterm';
import { terminalAppAdapter } from './terminal-app';

// 터미널 어댑터 레지스트리. 새 터미널 지원 = 여기에 한 줄 등록.
const ADAPTERS: Record<string, TerminalAdapter> = {
  [warpAdapter.id]: warpAdapter,
  [itermAdapter.id]: itermAdapter,
  [terminalAppAdapter.id]: terminalAppAdapter,
};

export function getAdapter(name: string): TerminalAdapter | null {
  return ADAPTERS[name] ?? null;
}

// 설치 여부(available)까지 포함해 비동기로 나열
export async function listAdapters(): Promise<TerminalInfo[]> {
  return Promise.all(
    Object.values(ADAPTERS).map(async (a) => ({
      id: a.id,
      name: a.name,
      available: a.isAvailable ? await a.isAvailable().catch(() => false) : true,
      supportsTab: a.supportsTab ?? false,
    })),
  );
}
