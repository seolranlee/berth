import type { LaunchResult } from '@shared';

export interface LaunchArgs {
  sessionId: string;
  cwd: string;
  command: string;
  title?: string;
}

// 모든 터미널 어댑터가 구현하는 계약.
// 메커니즘(Warp launch-config, AppleScript 등)이 달라도 이 인터페이스로 흡수.
export interface TerminalAdapter {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  launch(args: LaunchArgs): Promise<LaunchResult>;
}
